# TRACE v0.6.1.1 — Start Here

## Folder structure

```text
TRACE/
├── README.md
├── START_HERE.md
├── .gitignore
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       └── styles.css
└── backend/
    ├── package.json
    ├── src/
    │   ├── server.js
    │   └── complexity.js
    └── test/
        └── complexity.test.mjs
```

## Required tools

- Node.js (Node 22 recommended)
- npm
- JDK 21+ with both `java` and `javac` on PATH
- Modern web browser

Verify Java:

```powershell
java -version
javac -version
```

## Run TRACE

Open two PowerShell terminals.

### Terminal 1 — backend

```powershell
cd TRACE\backend
npm install
npm start
```

Keep this terminal running. It should show:

```text
TRACE backend running at http://localhost:5000
```

### Terminal 2 — frontend

```powershell
cd TRACE\frontend
npm install
npm run dev
```

Open the Vite URL, normally:

```text
http://localhost:5173
```

## Run backend tests (complexity + Java instrumentation)

From `TRACE\backend`:

```powershell
npm test
```

## What to expect

After clicking **Run & Analyze**, TRACE shows:

- Process execution time
- Profiled runtime
- Accumulated time by source line
- Per-execution microseconds
- Peak measured process/JVM memory
- Memory at each measured source line
- Measured memory change around each line
- Static heuristic time Big-O
- Static heuristic auxiliary-space Big-O
- Return/branch-safe line instrumentation for common multi-line Java methods
- Confidence and evidence for the complexity estimate
- Program output and compiler/runtime errors

## Important interpretation

TRACE deliberately separates:

**Measured execution**

What happened in one run on your computer.

**Big-O estimate**

A static classification inferred from recognizable source patterns.

The profiler does not claim that a single runtime measurement proves Big-O. For rigorous empirical validation, future versions can run the same algorithm against several increasing input sizes and fit the observed growth.

## Database

No database is needed yet. TRACE is a local execution profiler. A database becomes useful later for saved projects, execution history, accounts, and comparisons.

## Security

Keep this prototype local. It executes arbitrary Java code. Do not expose the backend to the public internet. A production service needs a hardened sandbox/container and strict resource controls.


Theme: use the Light/Dark button in the top-right. Your preference is saved in this browser.


## v0.5 instrumentation fix

TRACE now inserts measurement hooks before eligible source lines rather than after statements. This prevents the earlier unreachable-statement error after `return` and supports tested early-return and branch examples. Timing is attributed between successive instrumentation events, so line-level timing is approximate and includes instrumentation/runtime effects. The lightweight source transformer is not a full Java parser; unusual formatting, annotations, lambdas, multiline expressions, and complex unbraced control flow may still require further parser/bytecode-based work.


## v0.6 Java-analysis improvements

- Recursive methods invoked only with fixed literal arguments are not automatically treated as input-dependent exponential work.
- More realistic merge-sort recursion using `left`, `mid`, and `right` is recognized as `O(n log n)`.
- Temporary arrays sized from a range expression can contribute `O(n)` auxiliary space.
- Instrumentation avoids hooks on annotations, switch labels, class-member declarations, and lines continuing a multiline parenthesized expression.
- Regression suite covers standard complexity classes and mixed-algorithm programs.

Run `npm test` in `TRACE\backend`; all 29 tests passed for v0.6.1 in the development environment. The transformer is still not a complete Java parser, so review failures on unusual syntax rather than assuming every Java program is supported.


## v0.6.1 Java reliability additions
- Reports input-sensitive best/average/worst-case patterns for common quicksort/partition-style algorithms and early-exit search methods.
- Flags allocations and collection growth inside loops, plus code patterns that may clear/remove retained data. These are source-pattern hints, not exact heap-allocation measurements.
- Expands recursive-pattern regression coverage for linear recursion, halving recursion, branching recursion, divide-and-conquer sorting, and fixed-argument recursive calls.
- Adds compile-and-run instrumentation regression cases for nested loops/branches, early returns, thrown exceptions, catch blocks, and finally blocks.
- Displays input-sensitive case notes and memory-pattern flags in the complexity panel.
- The regression suite is designed to catch these cases; it does not turn the heuristic analyzer into a complete Java parser or formal Big-O proof.
