function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

const rank = {
  'O(1)': 0,
  'O(nm)': 4.2,
  'O(log n)': 1,
  'O(√n)': 2,
  'O(n)': 3,
  'O(n log n)': 4,
  'O(n√n)': 4.5,
  'O(n²)': 5,
  'O((log n)²)': 2.5,
  'O(n³)': 6,
  'O(n^4)': 7,
  'O(n^k)': 7,
  'O(2^n)': 8,
  'O(n!)': 9,
};

function better(a, b) { return (rank[a] ?? -1) >= (rank[b] ?? -1) ? a : b; }

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function findMatchingParen(source, openIndex) {
  let d = 0;
  let quote = null;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') d++;
    if (ch === ')') {
      d--;
      if (d === 0) return i;
    }
  }
  return -1;
}

function findMatchingBrace(source, openIndex) {
  let d = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') d++;
    else if (source[i] === '}') {
      d--;
      if (d === 0) return i;
    }
  }
  return -1;
}

function classifyLoop(header, body, keyword) {
  const h = header.replace(/\s+/g, ' ');
  const b = body.replace(/\s+/g, ' ');
  const logHeader = /\*=\s*2|<<=\s*1|\/=\s*2|>>=\s*1/.test(h);
  const logBody = keyword === 'while' && (/\b[A-Za-z_$][\w$]*\s*\/\s*=\s*2/.test(b) || /\b(?:n|x|size)\s*=\s*(?:n|x|size)\s*\/\s*2/.test(b));
  if (logHeader || logBody) {
    return ['O(log n)', 'Loop variable/size is repeatedly halved or doubled.'];
  }
  if (/Math\.sqrt\s*\(|\w+\s*\*\s*\w+\s*[<>=]=?\s*(?:n|\w+\.length|\w+\.size\(\))/.test(h)) {
    return ['O(√n)', 'Loop bound has a square-root style condition.'];
  }
  if (keyword === 'while' && /(low|left)\s*=.*mid\s*\+\s*1|(high|right)\s*=.*mid\s*-\s*1/.test(b) && /mid\s*=.*\/\s*2/.test(b)) {
    return ['O(log n)', 'Detected a binary-search style loop that halves the search interval.'];
  }
  if (/;\s*[\w$]+\s*[<>=!]+\s*\d+\s*;/.test(`;${h};`) || /;\s*[\w$]+\s*[<>=!]+\s*\d+\s*;/.test(h)) {
    return ['O(1)', 'Loop bound appears to be a fixed numeric constant rather than input-sized.'];
  }
  if (/\b(?:m|cols|width)\b/.test(h) && /\b(?:n|rows|height)\b/.test(h)) {
    return ['O(nm)', 'Loop bound appears to depend on two independent input dimensions.'];
  }
  return ['O(n)', 'Detected a size-dependent loop that advances toward an input-sized bound.'];
}

function collectLoops(source) {
  const loops = [];
  const keywordRegex = /\b(for|while)\s*\(/g;
  let m;
  while ((m = keywordRegex.exec(source))) {
    const keyword = m[1];
    const openParen = source.indexOf('(', m.index);
    const closeParen = findMatchingParen(source, openParen);
    if (closeParen < 0) continue;
    let bodyOpen = closeParen + 1;
    while (bodyOpen < source.length && /\s/.test(source[bodyOpen])) bodyOpen++;
    if (source[bodyOpen] !== '{') continue;
    const bodyClose = findMatchingBrace(source, bodyOpen);
    if (bodyClose < 0) continue;
    const header = source.slice(openParen + 1, closeParen);
    const body = source.slice(bodyOpen + 1, bodyClose);
    const [complexity, why] = classifyLoop(header, body, keyword);
    loops.push({
      keyword,
      line: lineNumber(source, m.index),
      start: m.index,
      bodyStart: bodyOpen,
      bodyEnd: bodyClose,
      complexity,
      why,
      header,
    });
  }
  return loops;
}

function methodBodies(source) {
  const out = [];
  const methodRegex = /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?[\w<>?, \[\]]+\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = methodRegex.exec(source))) {
    const openBrace = source.indexOf('{', m.index + m[0].length - 1);
    const closeBrace = findMatchingBrace(source, openBrace);
    if (closeBrace < 0) continue;
    out.push({
      name: m[1],
      params: m[2],
      body: source.slice(openBrace + 1, closeBrace),
      line: lineNumber(source, m.index),
      start: m.index,
      bodyStart: openBrace + 1,
      bodyEnd: closeBrace,
      end: closeBrace + 1,
    });
  }
  return out;
}

function firstParameterName(params) {
  const candidates = params.split(',').map(p => p.trim()).filter(Boolean);
  if (!candidates.length) return 'n';
  const first = candidates[0].match(/([A-Za-z_$][\w$]*)\s*(?:\[\])?\s*$/);
  return first?.[1] || 'n';
}

function hasOnlyFixedExternalCalls(source, method) {
  // A recursive method called exclusively with literal arguments contributes
  // constant work with respect to the surrounding program's input size.
  // Remove the method's own body first so recursive self-calls are not counted.
  const outside = source.slice(0, method.start) + source.slice(method.end);
  const callRegex = new RegExp(`\\b${method.name}\\s*\\(([^()]*)\\)`, 'g');
  const calls = [...outside.matchAll(callRegex)];
  if (calls.length === 0) return false;
  return calls.every(match => {
    const args = match[1].trim();
    if (!args) return true;
    return args.split(',').every(arg => /^[-+]?\d+(?:\.\d+)?[fFdDlL]?$/.test(arg.trim()) || /^(true|false|null)$/.test(arg.trim()));
  });
}

export function analyzeComplexity(code) {
  const source = stripCommentsAndStrings(code);
  const loops = collectLoops(source);
  const evidence = [];
  let time = 'O(1)';
  let timeConfidence = 'Medium';
  let recursionKind = null;

  for (const loop of loops) {
    // A loop's complexity is only promoted directly when it is not nested inside another loop.
    const parent = loops.find(other => other !== loop && other.bodyStart < loop.start && loop.bodyEnd < other.bodyEnd);
    if (!parent) {
      time = better(time, loop.complexity);
      evidence.push(`Line ${loop.line}: ${loop.why}`);
    }
  }

  // Determine the longest nested loop chain and multiply growth factors.
  function nestingChain(loop) {
    const parents = loops.filter(other => other !== loop && other.bodyStart < loop.start && loop.bodyEnd < other.bodyEnd);
    const nearest = parents.sort((a, b) => (b.bodyStart - a.bodyStart))[0];
    return nearest ? [...nestingChain(nearest), loop] : [loop];
  }

  let bestChain = [];
  for (const loop of loops) {
    const chain = nestingChain(loop);
    if (chain.length > bestChain.length) bestChain = chain;
  }
  if (bestChain.length >= 2) {
    const linearCount = bestChain.filter(x => x.complexity === 'O(n)').length;
    const logCount = bestChain.filter(x => x.complexity === 'O(log n)').length;
    const sqrtCount = bestChain.filter(x => x.complexity === 'O(√n)').length;
    let nested = 'O(n)';
    if (linearCount >= 1 && logCount >= 1 && sqrtCount === 0) nested = 'O(n log n)';
    else if (linearCount >= 1 && sqrtCount >= 1 && logCount === 0) nested = 'O(n√n)';
    else if (linearCount === 0 && logCount >= 2 && sqrtCount === 0) nested = 'O((log n)²)';
    else if (linearCount >= 4 && logCount === 0 && sqrtCount === 0) nested = 'O(n^k)';
    else if (sqrtCount >= 1 && linearCount + sqrtCount >= 2) nested = 'O(n²)';
    else if (linearCount === 3 && logCount === 0) nested = 'O(n³)';
    else if (linearCount === 2 && logCount === 0) nested = 'O(n²)';
    else if (linearCount === 1 && logCount === 0 && sqrtCount === 0) nested = 'O(n)';
    else if (linearCount === 0 && logCount === 1 && sqrtCount === 0) nested = 'O(log n)';
    time = better(time, nested);
    evidence.push(`Detected ${bestChain.length} nested loops; the nested growth is estimated as ${nested}.`);
  }

  if (loops.length === 0 && /\b(?:Arrays|Collections)\.sort\s*\(/.test(source)) {
    time = better(time, 'O(n log n)');
    evidence.push('Detected a library sort operation commonly modeled as O(n log n).');
  } else if (/\b(?:Arrays|Collections)\.sort\s*\(/.test(source)) {
    time = better(time, 'O(n log n)');
    evidence.push('Detected a library sort operation commonly modeled as O(n log n).');
  }
  if (/\b(?:binarySearch|Arrays\.binarySearch)\b/.test(source)) {
    time = better(time, 'O(log n)');
    evidence.push('Detected a binary-search/halving pattern.');
  }

  for (const method of methodBodies(source)) {
    const parameterNames = method.params.split(',').map(part => part.trim().match(/([A-Za-z_$][\w$]*)\s*(?:\[\])?\s*$/)?.[1]).filter(Boolean);
    const recursiveCalls = [...method.body.matchAll(new RegExp(`\\b${method.name}\\s*\\(`, 'g'))].length;
    const p = parameterNames.find(name => new RegExp(`\\b${method.name}\\s*\\([^)]*\\b${name}\\s*(?:-\\s*\\d+|/\\s*2|>>\\s*1)`).test(method.body)) || firstParameterName(method.params);
    if (!recursiveCalls) continue;
    if (hasOnlyFixedExternalCalls(source, method)) {
      evidence.push(`Method ${method.name}() is recursive, but its detected external calls use fixed literal arguments; its work is treated as constant with respect to the surrounding input size.`);
      continue;
    }
    const dec = new RegExp(`\\b${method.name}\\s*\\([^)]*\\b${p}\\s*-\\s*\\d+`);
    const half = new RegExp(`\\b${method.name}\\s*\\([^)]*\\b${p}\\s*(?:\/\\s*2|>>\\s*1)`);
    const loopAndDec = loops.some(loop => loop.bodyStart < source.indexOf(method.body) && loop.bodyEnd > source.indexOf(method.body));
    const hasHalfCalls = recursiveCalls >= 2 && /\b(?:merge|combine|partition|sort)\w*\s*\(/i.test(method.body) && (
      new RegExp(`\\b${method.name}\\s*\\([^)]*\\b${p}\\s*(?:/\\s*2|>>\\s*1)`).test(method.body) ||
      (/\bmid\b/.test(method.body) && new RegExp(`\\b${method.name}\\s*\\([^)]*\\bmid\\b`).test(method.body) && new RegExp(`\\b${method.name}\\s*\\([^)]*\\bmid\\s*\\+\\s*1`).test(method.body))
    );
    if (hasHalfCalls) {
      recursionKind = 'divide-and-conquer';
      time = better(time, 'O(n log n)');
      evidence.push(`Method ${method.name}() makes recursive calls on smaller halves and combines results, a common O(n log n) divide-and-conquer pattern.`);
    } else if (recursiveCalls >= 2 && dec.test(method.body)) {
      recursionKind = 'branching';
      time = better(time, 'O(2^n)');
      evidence.push(`Method ${method.name}() makes multiple recursive calls on a decreasing parameter, suggesting exponential branching O(2^n).`);
    } else if (recursiveCalls === 1 && half.test(method.body)) {
      recursionKind = 'log';
      time = better(time, 'O(log n)');
      evidence.push(`Method ${method.name}() recursively halves its parameter, suggesting O(log n).`);
    } else if (recursiveCalls === 1 && dec.test(method.body)) {
      recursionKind = 'linear';
      time = better(time, 'O(n)');
      evidence.push(`Method ${method.name}() recursively decreases its parameter, suggesting O(n).`);
    }
    if (recursiveCalls >= 1 && dec.test(method.body) && /\bfor\s*\([^)]*\b(?:i|j|k)\b[^)]*\b(?:n|size|length)\b[^)]*\)/.test(method.body)) {
      recursionKind = 'factorial';
      time = 'O(n!)';
      evidence.push(`Method ${method.name}() combines a size-dependent loop with recursive n-1 branching, a common factorial/permutation pattern O(n!).`);
    }
  }

  if (time === 'O(1)' && loops.length === 0 && !methodBodies(source).some(m => new RegExp(`\\b${m.name}\\s*\\(`).test(m.body))) {
    evidence.push('No size-dependent loops, recognized sorting/searching patterns, or recursive growth were detected.');
    timeConfidence = 'Medium';
  } else {
    timeConfidence = time === 'O(2^n)' || time === 'O(n!)' ? 'Medium' : 'High';
  }

  let space = 'O(1)';
  let spaceConfidence = 'High';
  if (/new\s+\w+\s*\[\s*(?:n|\w+\.length|\w+\.size\(\)|rows)\s*\]\s*\[\s*(?:n|\w+\.length|\w+\.size\(\)|cols)\s*\]/.test(source) || /new\s+\w+\s*\[\s*(?:n|\w+\.length|\w+\.size\(\))\s*\]\s*\[\s*(?:n|\w+\.length|\w+\.size\(\))\s*\]/.test(source)) {
    space = 'O(n²)';
    evidence.push('Detected a 2D input-sized allocation, suggesting O(n²) auxiliary space.');
    spaceConfidence = 'High';
  } else if (
    /new\s+[\w<>?, ]+\s*\[\s*(?:n|\w+\.length|\w+\.size\(\)|(?:right|high|end)\s*-\s*(?:left|low|start)(?:\s*\+\s*1)?|\w+\s*\+\s*1)\s*\]/.test(source) ||
    /\b(?:ArrayList|LinkedList|HashMap|HashSet|TreeMap|TreeSet)\s*<[^>]*>/.test(source)
  ) {
    space = 'O(n)';
    evidence.push('Detected an input-sized array allocation or dynamic collection, suggesting O(n) auxiliary space.');
    spaceConfidence = 'Medium';
  }
  if (recursionKind === 'linear' || recursionKind === 'branching' || recursionKind === 'factorial') {
    space = better(space, 'O(n)');
    evidence.push('Recursive depth can add O(n) call-stack space.');
  } else if (recursionKind === 'log' || recursionKind === 'divide-and-conquer') {
    space = better(space, 'O(log n)');
    evidence.push('Halving/divide-and-conquer recursion can add O(log n) call-stack space; temporary arrays may increase auxiliary space further.');
  }

  // Input-sensitive algorithms: report that different values/distributions can
  // change the path taken, instead of pretending one execution tells the whole story.
  const inputSensitive = [];
  if (/\b(?:quickSort|quicksort|partition)\w*\s*\(/i.test(source) ||
      /\bpartition\s*\(/i.test(source) && /\bpivot\b/i.test(source)) {
    time = better(time, 'O(n²)');
    inputSensitive.push({
      algorithm: 'Quicksort/partition-style sorting',
      bestCase: 'O(n log n)',
      averageCase: 'O(n log n)',
      worstCase: 'O(n²)',
      reason: 'Partition balance depends on pivot choice and the order/distribution of input values.'
    });
    evidence.push('Detected quicksort/partition-style recursion: typical time is O(n log n), but unbalanced partitions can produce O(n²) worst-case time.');
    timeConfidence = 'Medium';
  }
  if (/\b(?:if|while)\s*\([^)]*(?:==|!=|<|>|<=|>=)[^)]*\)/.test(source) &&
      /\breturn\b/.test(source) && /\b(?:find|search|contains|indexOf)\w*\s*\(/i.test(source)) {
    inputSensitive.push({
      algorithm: 'Early-exit search',
      bestCase: 'O(1)',
      averageCase: 'O(n)',
      worstCase: 'O(n)',
      reason: 'A match near the beginning can return early; a late or missing match may scan most or all values.'
    });
    evidence.push('Detected a search-like method with a conditional return; observed work can vary with the target value and its position.');
  }

  const allocationInLoop = loops.some(loop => {
    const body = source.slice(loop.bodyStart, loop.bodyEnd);
    return /\bnew\s+[\w$.<>?]+\s*(?:\[[^\]]*\]|\([^)]*\))/.test(body) ||
      /\b(?:ArrayList|LinkedList|HashMap|HashSet|StringBuilder)\s*<|\.add\s*\(|\.put\s*\(/.test(body);
  });
  if (allocationInLoop) {
    evidence.push('Detected allocation or collection-growth operations inside a loop. Memory may rise with the number of iterations, but garbage collection and object retention determine observed JVM snapshots.');
  }
  const allocationLifecycle = /\bnew\s+[\w$.<>?]+\s*\[|\bnew\s+[\w$.<>?]+\s*\(/.test(source) &&
    /\b(?:null|clear|remove|setLength)\b|\.clear\s*\(|\.remove\s*\(/.test(source);
  if (allocationLifecycle) {
    evidence.push('Detected both allocation and a possible clearing/removal operation. This suggests a memory lifecycle, but source-level heuristics cannot prove when objects become unreachable or when the JVM collects them.');
  }

  const classRank = rank[time] ?? -1;
  const limitations = [];
  if (/\b(stream|parallelStream|\.collect\s*\(|computeIfAbsent|computeIfPresent)\b/.test(source)) limitations.push('Stream or callback-based operations may hide work inside library methods.');
  if (allocationInLoop) limitations.push('Allocations inside loops are detected syntactically; measured heap snapshots are affected by garbage collection and do not equal exact per-line allocation volume.');
  if (inputSensitive.length) limitations.push('Input-sensitive best/average/worst-case notes are pattern-based. Input distribution, early exits, and branch behavior should be validated with multiple test inputs.');
  if (/\b(?:sort|sorted|map|flatMap|reduce|distinct|groupingBy)\s*\(/.test(source) && !/Arrays\.sort|Collections\.sort/.test(source)) limitations.push('A collection/stream operation was detected, but its full runtime cost depends on the collection size and implementation.');
  if (/\b(?:PriorityQueue|TreeMap|TreeSet|HashMap|HashSet)\b/.test(source)) limitations.push('Collection operations have operation-specific costs; declaring the type alone does not prove total complexity.');
  if (/\b(?:synchronized|volatile|Thread|Executor|CompletableFuture)\b/.test(source)) limitations.push('Concurrency and scheduling can change observed runtime and are not fully modeled by this static estimate.');
  if (loops.length === 0 && !/\b(?:sort|binarySearch|mergeSort|quickSort|factorial|permute)\w*\s*\(/i.test(source) && !/\bnew\s+\w+\s*\[/.test(source)) limitations.push('No strong input-size pattern was found; O(1) is a provisional estimate, not proof of constant complexity.');
  return {
    timeComplexity: time,
    spaceComplexity: space,
    timeConfidence,
    spaceConfidence,
    evidence: evidence.slice(0, 10),
    limitations: limitations.length ? limitations.join(' ') : 'Recognized common source patterns. Complex library calls, data-dependent branches, and caller-provided input assumptions may still affect the true complexity.',
    detectedLoops: loops.map(x => ({ line: x.line, complexity: x.complexity, header: x.header })),
    inputSensitiveAnalysis: inputSensitive,
    memoryPatternFlags: { allocationInsideLoop: allocationInLoop, allocationAndReleasePattern: allocationLifecycle },
    supportedClasses: ['O(1)', 'O(log n)', 'O(√n)', 'O(n)', 'O(n log n)', 'O(nm)', 'O(n²)', 'O(n³)', 'O(2^n)', 'O(n!)', 'O(n^k)'],
    note: 'TRACE estimates asymptotic complexity from recognizable Java source patterns and inferred input-size relationships. Fixed-literal calls are treated as constant with respect to the surrounding input size. This is heuristic analysis, not a formal proof; validate with growing inputs.'
  };
}
