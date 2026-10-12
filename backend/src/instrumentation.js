function advanceParenDepth(line, depth, state) {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (state.textBlock) {
      if (line.slice(i, i + 3) === '"""') { state.textBlock = false; i += 2; }
      continue;
    }
    if (state.blockComment) {
      if (ch === '*' && next === '/') { state.blockComment = false; i++; }
      continue;
    }
    if (state.quote) {
      if (ch === '\\') i++;
      else if (ch === state.quote) state.quote = null;
      continue;
    }
    if (ch === '/' && next === '/') break;
    if (ch === '/' && next === '*') { state.blockComment = true; i++; continue; }
    if (line.slice(i, i + 3) === '"""') { state.textBlock = true; i += 2; continue; }
    if (ch === '"' || ch === "'") { state.quote = ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
  }
  return depth;
}

export function instrumentJava(source) {
  // Instrument only *before* executable source lines. Inserting code after a
  // return/throw/break/continue creates unreachable Java statements. A single
  // event clock attributes the interval between source-line hits to the prior
  // line, and closes the final interval during shutdown.
  // Editors may receive Markdown-fenced Java pasted from chat/docs. Keep fence
  // lines as blanks so source line numbers stay stable, but never instrument them.
  const lines = source.replace(/\r\n/g, '\n').split('\n').map(line =>
    /^\s*```(?:java)?\s*$/i.test(line) ? '' : line
  );
  const out = [];
  let injected = false;
  let inBlockComment = false;
  let skipNextSingleStatement = false;
  let braceDepth = 0;
  let parenDepth = 0;
  const lexicalState = { blockComment: false, quote: null, textBlock: false };

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    const trimmed = original.trim();
    const lineNo = i + 1;
    const indent = original.match(/^\s*/)?.[0] ?? '';

    if (!injected && /^\s*public\s+class\s+Main\b/.test(original)) {
      out.push(original);
      out.push('    static final TraceRuntime TRACE = new TraceRuntime();');
      injected = true;
      braceDepth += (original.match(/\{/g) || []).length - (original.match(/\}/g) || []).length;
      parenDepth = advanceParenDepth(original, parenDepth, lexicalState);
      continue;
    }

    const startsBlockComment = trimmed.startsWith('/*') || inBlockComment;
    if (trimmed.includes('/*') && !trimmed.includes('*/')) inBlockComment = true;
    if (inBlockComment && trimmed.includes('*/')) inBlockComment = false;
    const isComment = !trimmed || trimmed.startsWith('//') || startsBlockComment || trimmed.startsWith('*') || trimmed.startsWith('*/');
    const isPackageImport = /^(package|import)\b/.test(trimmed);
    const isDeclarationOrStructure = trimmed === '{' || trimmed === '}' || trimmed === '};' ||
      trimmed.endsWith('{') ||
      /^(public|private|protected)?\s*(static\s+)?(class|interface|enum|record)\b/.test(trimmed) ||
      /^(public|private|protected|static|final|synchronized|native|abstract|\w[\w<>?,.\[\]]*)\s+.*\)\s*;?$/.test(trimmed) && braceDepth <= 1 ||
      /^@[\w.]+/.test(trimmed) || /^(case\b.*:|default\s*:)$/.test(trimmed);

    // Avoid changing semantics for unbraced control statements such as
    // `if (x) return;` or `for (...) work();` by skipping instrumentation on
    // their immediate body line when the body is on the following line.
    const isControlHeader = /^(if|else\s+if|while|for|switch|synchronized|catch)\b.*\)?\s*$/.test(trimmed) && !trimmed.endsWith('{');
    const shouldSkip = skipNextSingleStatement;
    skipNextSingleStatement = isControlHeader;

    const isInsideExecutableBlock = braceDepth >= 2;
    const isContinuationLine = parenDepth > 0;
    if (!isComment && !isPackageImport && !isDeclarationOrStructure && !shouldSkip && injected && isInsideExecutableBlock && !isContinuationLine) {
      out.push(`${indent}TRACE.hit(${lineNo});`);
    }
    out.push(original);
    parenDepth = advanceParenDepth(original, parenDepth, lexicalState);
    braceDepth += (original.match(/\{/g) || []).length - (original.match(/\}/g) || []).length;
  }

  const runtime = `
class TraceRuntime {
    private final long startNs = System.nanoTime();
    private long lastNs = startNs;
    private int lastLine = -1;
    private long lastMemory = usedMemory();
    private final java.util.Map<Integer, Long> timeNs = new java.util.LinkedHashMap<>();
    private final java.util.Map<Integer, Long> hits = new java.util.LinkedHashMap<>();
    private final java.util.Map<Integer, Long> memoryAtBytes = new java.util.LinkedHashMap<>();
    private final java.util.Map<Integer, Long> memoryDeltaBytes = new java.util.LinkedHashMap<>();
    private long peakBytes = usedMemory();

    TraceRuntime() {
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try { closeAndWrite(System.getenv("TRACE_RESULT")); } catch (Exception ignored) {}
        }));
    }

    synchronized void hit(int line) {
        long now = System.nanoTime();
        long mem = usedMemory();
        if (lastLine >= 0) {
            timeNs.merge(lastLine, Math.max(0L, now - lastNs), Long::sum);
            memoryDeltaBytes.merge(lastLine, mem - lastMemory, Long::sum);
            memoryAtBytes.put(lastLine, mem);
        }
        hits.merge(line, 1L, Long::sum);
        memoryAtBytes.put(line, mem);
        peakBytes = Math.max(peakBytes, mem);
        lastLine = line;
        lastNs = now;
        lastMemory = mem;
    }

    synchronized void closeAndWrite(String file) throws Exception {
        long now = System.nanoTime();
        long mem = usedMemory();
        if (lastLine >= 0) {
            timeNs.merge(lastLine, Math.max(0L, now - lastNs), Long::sum);
            memoryDeltaBytes.merge(lastLine, mem - lastMemory, Long::sum);
            memoryAtBytes.put(lastLine, mem);
        }
        peakBytes = Math.max(peakBytes, mem);
        StringBuilder sb = new StringBuilder();
        sb.append("{\\\"profiledWallTimeMs\\\":").append((now - startNs) / 1_000_000.0);
        sb.append(",\\\"peakMemoryMb\\\":").append(peakBytes / 1048576.0);
        sb.append(",\\\"lines\\\":[");
        boolean first = true;
        for (Integer line : hits.keySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append("{\\\"line\\\":").append(line);
            sb.append(",\\\"executions\\\":").append(hits.getOrDefault(line, 0L));
            sb.append(",\\\"timeMs\\\":").append(timeNs.getOrDefault(line, 0L) / 1_000_000.0);
            sb.append(",\\\"memoryAtMb\\\":").append(memoryAtBytes.getOrDefault(line, 0L) / 1048576.0);
            sb.append(",\\\"memoryDeltaMb\\\":").append(memoryDeltaBytes.getOrDefault(line, 0L) / 1048576.0);
            sb.append("}");
        }
        sb.append("]}");
        java.nio.file.Files.writeString(java.nio.file.Path.of(file), sb.toString());
    }

    private static long usedMemory() {
        Runtime r = Runtime.getRuntime();
        return r.totalMemory() - r.freeMemory();
    }
}
`;
  return out.join('\n') + '\n' + runtime;
}

