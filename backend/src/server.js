import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 5000;
const ROOT = path.resolve(process.cwd());
const RUNS = path.join(ROOT, 'runs');
await fs.mkdir(RUNS, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '250kb' }));

const defaultCode = `public class Main {
    public static void main(String[] args) {
        int sum = 0;
        for (int i = 0; i < 100000; i++) {
            sum += i;
        }
        System.out.println(sum);
    }
}`;

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'TRACE backend' }));
app.get('/api/default-code', (req, res) => res.json({ code: defaultCode }));

import { analyzeComplexity } from './complexity.js';
import { instrumentJava } from './instrumentation.js';


function runJava(cwd, input, timeoutMs, resultPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('java', ['-Xmx256m', 'Main'], {
      cwd,
      env: { ...process.env, TRACE_RESULT: resultPath },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        child.kill('SIGTERM');
        settled = true;
        resolve({ stdout, stderr: stderr + '\nExecution timed out.', timedOut: true });
      }
    }, timeoutMs);
    child.stdout.on('data', d => { stdout += d.toString(); if (stdout.length > 2 * 1024 * 1024) child.kill(); });
    child.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 2 * 1024 * 1024) child.kill(); });
    child.on('error', err => { clearTimeout(timer); if (!settled) { settled = true; reject(err); } });
    child.on('close', code => {
      clearTimeout(timer);
      if (!settled) { settled = true; resolve({ stdout, stderr, exitCode: code ?? -1, timedOut: false }); }
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

function parseJsonSafe(text) {
  try { return JSON.parse(text); } catch { return null; }
}

app.post('/api/analyze', async (req, res) => {
  const code = String(req.body?.code ?? '').trim();
  const input = String(req.body?.input ?? '');
  const timeoutMs = Math.min(Math.max(Number(req.body?.timeoutMs ?? 5000), 500), 15000);
  if (!code) return res.status(400).json({ error: 'Code is required.' });
  if (!/class\s+Main\b/.test(code)) return res.status(400).json({ error: 'Your Java code must contain a class named Main.' });

  const complexity = analyzeComplexity(code);
  const id = randomUUID();
  const dir = path.join(RUNS, id);
  await fs.mkdir(dir, { recursive: true });
  const sourcePath = path.join(dir, 'Main.java');
  const resultPath = path.join(dir, 'trace-result.json');
  const inputPath = path.join(dir, 'input.txt');
  const instrumented = instrumentJava(code);
  await fs.writeFile(sourcePath, instrumented, 'utf8');
  await fs.writeFile(inputPath, input, 'utf8');

  let stdout = '', stderr = '', timedOut = false, compileError = false, exitCode = 0;
  try {
    await execFileAsync('javac', ['Main.java'], { cwd: dir, timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  } catch (e) {
    compileError = true;
    stderr = e.stderr || e.message;
  }
  if (compileError) {
    await fs.rm(dir, { recursive: true, force: true });
    return res.json({ ok: false, phase: 'compile', error: stderr, complexity });
  }

  const processStart = performance.now();
  try {
    const r = await runJava(dir, input, timeoutMs, resultPath);
    stdout = r.stdout;
    stderr = r.stderr;
    timedOut = r.timedOut;
    exitCode = r.exitCode ?? 0;
  } catch (e) {
    stderr = e.message || String(e);
  }
  const hostWallMs = performance.now() - processStart;
  const trace = existsSync(resultPath) ? parseJsonSafe(await fs.readFile(resultPath, 'utf8')) : null;
  const sourceLines = code.replace(/\r\n/g, '\n').split('\n');
  const lineMap = (trace?.lines || []).map(x => ({
    ...x,
    source: sourceLines[x.line - 1] ?? ''
  }));
  const processTimeMs = hostWallMs;
  const profiledRuntimeMs = trace?.profiledWallTimeMs ?? hostWallMs;
  const profiledLineTimeMs = lineMap.reduce((sum, x) => sum + Number(x.timeMs || 0), 0);
  const unattributedMs = Math.max(0, profiledRuntimeMs - profiledLineTimeMs);
  const peakMemoryMb = trace?.peakMemoryMb ?? null;

  const status = timedOut ? 'TIMEOUT' : (exitCode !== 0 ? 'RUNTIME ERROR' : 'COMPLETED');
  const response = {
    ok: status === 'COMPLETED',
    id,
    status,
    processTimeMs: Number(processTimeMs.toFixed(4)),
    profiledRuntimeMs: Number(profiledRuntimeMs.toFixed(4)),
    profiledLineTimeMs: Number(profiledLineTimeMs.toFixed(4)),
    unattributedMs: Number(unattributedMs.toFixed(4)),
    peakMemoryMb: peakMemoryMb == null ? null : Number(peakMemoryMb.toFixed(4)),
    exitCode,
    stdout,
    stderr,
    lines: lineMap,
    complexity,
    note: 'Measured values are empirical for this local run. Line time is accumulated instrumentation time; memory is a process/JVM snapshot at the execution point. Big-O is a static heuristic estimate and should be validated across growing input sizes.'
  };
  res.json(response);

  setTimeout(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}), 1000);
});

app.listen(PORT, () => console.log(`TRACE backend running at http://localhost:${PORT}`));
