<<<<<<< HEAD
## Getting Started

See [START_HERE.md](START_HERE.md) for installation
and instructions to run TRACE locally.

# TRACE v0.6.1.1

Visual Program Execution Time & Memory Profiler for Students.

## What this version does

TRACE is a local Java profiling prototype with an added **complexity analysis layer**. It provides:

- Java code editor
- Local compilation/execution through the backend
- Execution timeout
- Process execution time
- Profiled runtime
- Accumulated line-level execution time
- Line execution counts
- Memory snapshot at a source line
- Measured memory change around a line
- Interactive time graph
- Interactive memory graph
- Line analysis table
- Time accounting panel
- Static heuristic Big-O analysis
- Estimated time complexity classes including O(1), O(log n), O(√n), O(n), O(n log n), O(n²), O(n³), O(2^n), and O(n!) when recognizable patterns are detected
- Estimated auxiliary space complexity
- Complexity evidence and confidence
- Program output and errors

## What TRACE means by "complexity"

TRACE reports two different kinds of information:

1. **Measured execution:** what happened in this particular local run.
2. **Estimated Big-O:** a static heuristic classification inferred from source-code structure.

A single run cannot mathematically prove Big-O. For rigorous empirical validation, the same algorithm should be tested with increasing input sizes and the measured trend should be compared with the theoretical model.

## Important profiling limitation

This version uses source-level Java instrumentation. Each instrumented event records timing and a JVM process-memory snapshot. Instrumentation itself adds overhead, so line timings are best interpreted as profiling measurements, not as exact hardware-level costs of an individual source line.

Memory values are **process/JVM snapshots at an execution point**, not a claim that the source line owns the entire reported memory value. The table also reports a measured memory change around the line where that can be observed.

## Architecture

Browser (React + Vite)
    -> HTTP JSON API
Node/Express backend
    -> Java source instrumentation
    -> javac
    -> java child process
    -> profiling result JSON
    -> complexity analysis
    -> browser visualization

No database is required for the current version. A database can be introduced later for saved projects, run history, comparisons, and accounts.

## Requirements

- Node.js 20+ (Node 22 recommended)
- npm
- JDK 21+ with `java` and `javac` available on PATH
- Windows/macOS/Linux
- Modern browser

## Run on Windows PowerShell

Open two terminals.

### Terminal 1 — backend

```powershell
cd TRACE\backend
npm install
npm start
```

Expected:

```text
TRACE backend running at http://localhost:5000
```

### Terminal 2 — frontend

```powershell
cd TRACE\frontend
npm install
npm run dev
```

Open the URL printed by Vite, normally:

```text
http://localhost:5173
```

## Verify Java

```powershell
java -version
javac -version
```

## Security note

The backend executes arbitrary Java code. Keep this prototype local. Do not expose it to the public internet. A production version should execute user code in a hardened sandbox/container with strict CPU, memory, filesystem, process, and network controls.

## Future scope

Coding-platform integration (LeetCode, HackerRank, CodeChef, Codeforces, etc.) remains future scope. Other future improvements can include stronger JVM/bytecode instrumentation, more precise allocation profiling, multi-language support, saved runs, and empirical complexity benchmarking across multiple input sizes.


## v0.5 updates
- Added a persistent light/dark theme toggle.
- Expanded static complexity heuristics for fixed-bound loops, common divide-and-conquer recursion, collection/stream caveats, and more explicit analysis limitations.

## v0.6 updates
- Improved recursive complexity handling when a recursive method is only called with fixed literal arguments (for example, `fibonacci(20)`) so that fixed work does not automatically dominate complexity relative to another input size.
- Improved recognition of merge-sort-style recursion using `left`, `mid`, and `right` bounds.
- Improved auxiliary-space recognition for temporary arrays allocated from range expressions such as `new int[right - left + 1]`.
- Improved Java instrumentation to avoid injecting hooks into class-member declarations, annotation lines, switch labels, and multiline parenthesized expressions.
- Added regression coverage for constant, logarithmic, linear, `n log n`, quadratic, cubic, exponential, factorial, realistic merge sort, fixed-work recursion, mixed algorithms, early returns, annotations, multiline expressions, and pasted Markdown fences.
- Current backend regression suite: 19 tests. Run `npm test` from `backend` to verify locally.

Big-O results remain static heuristic estimates rather than formal proofs. Complex syntax, overloaded methods, dynamic dispatch, library internals, and caller-provided assumptions may still need stronger analysis.


## v0.6.1 Java reliability additions
- Reports input-sensitive best/average/worst-case patterns for common quicksort/partition-style algorithms and early-exit search methods.
- Flags allocations and collection growth inside loops, plus code patterns that may clear/remove retained data. These are source-pattern hints, not exact heap-allocation measurements.
- Expands recursive-pattern regression coverage for linear recursion, halving recursion, branching recursion, divide-and-conquer sorting, and fixed-argument recursive calls.
- Adds compile-and-run instrumentation regression cases for nested loops/branches, early returns, thrown exceptions, catch blocks, and finally blocks.
- Displays input-sensitive case notes and memory-pattern flags in the complexity panel.
- The regression suite is designed to catch these cases; it does not turn the heuristic analyzer into a complete Java parser or formal Big-O proof.
=======
# TRACE
TRACE is a Java-based Visual Program Execution Profiler that analyzes code execution, measures line-level time and memory usage, and estimates time and space complexity using static analysis and runtime profiling.
>>>>>>> 16137dc75727d2e224f34a665ddeea7c1e1e936b
