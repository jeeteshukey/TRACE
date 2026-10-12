import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { instrumentJava } from '../src/instrumentation.js';

async function compileAndRun(code) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trace-java-test-'));
  try {
    await fs.writeFile(path.join(dir, 'Main.java'), instrumentJava(code), 'utf8');
    const compiled = spawnSync('javac', ['Main.java'], { cwd: dir, encoding: 'utf8' });
    assert.equal(compiled.status, 0, `javac failed:\n${compiled.stderr}`);
    const resultPath = path.join(dir, 'result.json');
    const ran = spawnSync('java', ['Main'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, TRACE_RESULT: resultPath },
      timeout: 5000
    });
    assert.equal(ran.status, 0, `java failed:\n${ran.stderr}`);
    const result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
    return { stdout: ran.stdout, result };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('instrumentation compiles methods with early return statements', async () => {
  const code = `import java.util.*;
public class Main {
  static int find(int[] a, int target) {
    for (int i = 0; i < a.length; i++) {
      if (a[i] == target) {
        return i;
      }
    }
    return -1;
  }
  public static void main(String[] args) {
    System.out.println(find(new int[]{2, 4, 6}, 4));
  }
}`;
  const { stdout, result } = await compileAndRun(code);
  assert.match(stdout, /1/);
  assert.ok(result.lines.length > 0, 'expected line profiling data');
});

test('instrumentation compiles branch exits', async () => {
  const code = `public class Main {
  static int value(boolean yes) {
    if (yes) {
      return 7;
    } else {
      return 9;
    }
  }
  public static void main(String[] args) {
    System.out.println(value(true));
  }
}`;
  const { stdout } = await compileAndRun(code);
  assert.match(stdout, /7/);
});

test('instrumentation preserves multiline expressions and annotations', async () => {
  const code = `public class Main {
  @Deprecated
  static int add(int a, int b) {
    return a + b;
  }
  public static void main(String[] args) {
    int result = add(
      2,
      3
    );
    System.out.println(result);
  }
}`;
  const { stdout } = await compileAndRun(code);
  assert.match(stdout, /5/);
});

test('instrumentation ignores Markdown fences pasted around Java source', async () => {
  const code = `\`\`\`java
import java.util.*;
public class Main {
  static int find(int[] a, int target) {
    for (int i = 0; i < a.length; i++) {
      if (a[i] == target) return i;
    }
    return -1;
  }
  public static void main(String[] args) {
    System.out.println(find(new int[]{2, 4, 6}, 4));
  }
}
\`\`\``;
  const { stdout } = await compileAndRun(code);
  assert.match(stdout, /1/);
});

test('instruments nested control flow and loop allocation while preserving output', async () => {
  const code = `import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<int[]> batches = new ArrayList<>();
    int total = 0;
    for (int i = 0; i < 4; i++) {
      if (i % 2 == 0) {
        for (int j = 0; j < 3; j++) { total += i + j; }
      } else {
        batches.add(new int[]{i, i + 1});
      }
    }
    batches.clear();
    System.out.println("total=" + total);
  }
}`;
  const { stdout, result } = await compileAndRun(code);
  assert.match(stdout, /total=12/);
  assert.ok(result.lines.some(line => line.executions > 1), 'expected repeated line hits in nested loops');
});

test('preserves exception handling and finally blocks', async () => {
  const code = `public class Main {
  static int compute(boolean fail) {
    try {
      if (fail) throw new IllegalArgumentException("expected");
      return 10;
    } catch (IllegalArgumentException ex) {
      return 20;
    } finally {
      System.out.print("F");
    }
  }
  public static void main(String[] args) {
    System.out.println(compute(true));
    System.out.println(compute(false));
  }
}`;
  const { stdout, result } = await compileAndRun(code);
  assert.match(stdout, /F20/);
  assert.match(stdout, /F10/);
  assert.ok(result.lines.length > 0);
});

test('preserves early returns in nested branches', async () => {
  const code = `public class Main {
  static int pick(int x) {
    if (x < 0) {
      if (x == -1) return 11;
      return 12;
    }
    if (x == 0) return 13;
    return 14;
  }
  public static void main(String[] args) {
    System.out.println(pick(-1) + "," + pick(-2) + "," + pick(0) + "," + pick(2));
  }
}`;
  const { stdout } = await compileAndRun(code);
  assert.match(stdout, /11,12,13,14/);
});
