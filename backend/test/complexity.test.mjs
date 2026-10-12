import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeComplexity } from '../src/complexity.js';

const wrap = body => `public class Main { public static void main(String[] args) { ${body} } }`;

test('detects constant time and constant space', () => {
  const r = analyzeComplexity(wrap('int x = 1; System.out.println(x);'));
  assert.equal(r.timeComplexity, 'O(1)');
  assert.equal(r.spaceComplexity, 'O(1)');
});

test('detects logarithmic loop', () => {
  const r = analyzeComplexity(wrap('int n = 100; while(n > 1) { n /= 2; }'));
  assert.equal(r.timeComplexity, 'O(log n)');
});

test('detects linear time and linear array space', () => {
  const r = analyzeComplexity(wrap('int n = 100; int[] a = new int[n]; for(int i=0;i<n;i++){ a[i]=i; }'));
  assert.equal(r.timeComplexity, 'O(n)');
  assert.equal(r.spaceComplexity, 'O(n)');
});

test('detects quadratic nested loops', () => {
  const r = analyzeComplexity(wrap('int n = 100; for(int i=0;i<n;i++){ for(int j=0;j<n;j++){ int x=i+j; } }'));
  assert.equal(r.timeComplexity, 'O(n²)');
});

test('detects n log n', () => {
  const r = analyzeComplexity(wrap('int n = 100; for(int i=0;i<n;i++){ int k=n; while(k>1){ k/=2; } }'));
  assert.equal(r.timeComplexity, 'O(n log n)');
});

test('detects cubic nesting', () => {
  const r = analyzeComplexity(wrap('int n = 10; for(int i=0;i<n;i++){ for(int j=0;j<n;j++){ for(int k=0;k<n;k++){ int x=i+j+k; } } }'));
  assert.equal(r.timeComplexity, 'O(n³)');
});

test('detects exponential branching recursion', () => {
  const code = `class Main { static int f(int n){ if(n<=1) return 1; return f(n-1)+f(n-1); } public static void main(String[] args){} }`;
  const r = analyzeComplexity(code);
  assert.equal(r.timeComplexity, 'O(2^n)');
  assert.equal(r.spaceComplexity, 'O(n)');
});

test('detects factorial permutation-style recursion', () => {
  const code = `class Main { static void permute(int n){ if(n<=1)return; for(int i=0;i<n;i++){ permute(n-1); } } public static void main(String[] args){} }`;
  const r = analyzeComplexity(code);
  assert.equal(r.timeComplexity, 'O(n!)');
  assert.equal(r.spaceComplexity, 'O(n)');
});


test('recognizes loops bounded by a fixed numeric constant as constant time', () => {
  const r = analyzeComplexity(wrap('for (int i = 0; i < 10; i++) { System.out.println(i); }'));
  assert.equal(r.timeComplexity, 'O(1)');
});

test('recognizes common divide-and-conquer sorting recursion', () => {
  const code = `class Main { static void mergeSort(int[] a, int n) { if(n<=1)return; mergeSort(a,n/2); mergeSort(a,n/2); merge(a); } static void merge(int[] a){} public static void main(String[] args){} }`;
  const r = analyzeComplexity(code);
  assert.equal(r.timeComplexity, 'O(n log n)');
  assert.equal(r.spaceComplexity, 'O(log n)');
});

test('provides a limitation note for patterns that cannot be fully modeled statically', () => {
  const r = analyzeComplexity(wrap('items.stream().map(x -> transform(x)).toList();'));
  assert.ok(r.limitations.length > 0);
});

test('treats recursive work called only with a fixed literal argument as constant in the surrounding input size', () => {
  const code = `class Main {
    static int fibonacci(int n) {
      if (n <= 1) return n;
      return fibonacci(n - 1) + fibonacci(n - 2);
    }
    public static void main(String[] args) { System.out.println(fibonacci(20)); }
  }`;
  const r = analyzeComplexity(code);
  assert.equal(r.timeComplexity, 'O(1)');
  assert.ok(r.evidence.some(item => item.includes('fixed literal arguments')));
});

test('detects realistic merge sort using left, mid, and right bounds', () => {
  const code = `public class Main {
    static void mergeSort(int[] arr, int left, int right) {
      if (left >= right) return;
      int mid = left + (right - left) / 2;
      mergeSort(arr, left, mid);
      mergeSort(arr, mid + 1, right);
      int[] temp = new int[right - left + 1];
      merge(arr, temp, left, mid, right);
    }
    static void merge(int[] arr, int[] temp, int left, int mid, int right) {}
    public static void main(String[] args) {
      int[] arr = new int[100];
      mergeSort(arr, 0, arr.length - 1);
    }
  }`;
  const r = analyzeComplexity(code);
  assert.equal(r.timeComplexity, 'O(n log n)');
  assert.equal(r.spaceComplexity, 'O(n)');
});

test('estimates mixed quadratic work with fixed-argument exponential recursion as quadratic overall', () => {
  const code = `public class Main {
    static long countPairs(int[] arr) {
      long count = 0;
      for (int i = 0; i < arr.length; i++) {
        for (int j = i + 1; j < arr.length; j++) {
          if (arr[i] < arr[j]) count++;
        }
      }
      return count;
    }
    static int fibonacci(int n) {
      if (n <= 1) return n;
      return fibonacci(n - 1) + fibonacci(n - 2);
    }
    public static void main(String[] args) {
      int n = 3000;
      int[] arr = new int[n];
      countPairs(arr);
      System.out.println(fibonacci(20));
    }
  }`;
  const r = analyzeComplexity(code);
  assert.equal(r.timeComplexity, 'O(n²)');
  assert.equal(r.spaceComplexity, 'O(n)');
  assert.ok(r.evidence.some(item => item.includes('fixed literal arguments')));
});

test('does not misclassify divide-and-conquer midpoint calculation as binary search by itself', () => {
  const code = `public class Main {
    static void divide(int n) {
      if (n <= 1) return;
      int mid = n / 2;
      divide(mid);
      divide(n - mid);
      combine();
    }
    static void combine() {}
    public static void main(String[] args) { divide(100); }
  }`;
  const r = analyzeComplexity(code);
  assert.notEqual(r.timeComplexity, 'O(log n)');
});

test('reports best, average, and worst cases for input-sensitive quicksort', () => {
  const code = `class Main {
    static void quickSort(int[] a, int left, int right) {
      if (left >= right) return;
      int pivotIndex = partition(a, left, right);
      quickSort(a, left, pivotIndex - 1);
      quickSort(a, pivotIndex + 1, right);
    }
    static int partition(int[] a, int left, int right) { int pivot = a[right]; return right; }
    public static void main(String[] args) {}
  }`;
  const r = analyzeComplexity(code);
  assert.equal(r.timeComplexity, 'O(n²)');
  assert.ok(r.inputSensitiveAnalysis.some(x => x.bestCase === 'O(n log n)' && x.worstCase === 'O(n²)'));
});

test('explains value-dependent early exit in search methods', () => {
  const code = `class Main {
    static int search(int[] a, int target) {
      for (int i = 0; i < a.length; i++) { if (a[i] == target) return i; }
      return -1;
    }
    public static void main(String[] args) {}
  }`;
  const r = analyzeComplexity(code);
  assert.ok(r.inputSensitiveAnalysis.some(x => x.bestCase === 'O(1)' && x.worstCase === 'O(n)'));
  assert.ok(r.evidence.some(x => x.includes('target value')));
});

test('flags allocation and collection growth inside loops', () => {
  const r = analyzeComplexity(wrap('List<int[]> rows = new ArrayList<>(); for (int i=0; i<n; i++) { rows.add(new int[i + 1]); }'));
  assert.equal(r.memoryPatternFlags.allocationInsideLoop, true);
  assert.ok(r.evidence.some(x => x.includes('inside a loop')));
});

test('flags allocation and release/clear patterns without claiming exact collection timing', () => {
  const r = analyzeComplexity(wrap('List<Integer> values = new ArrayList<>(); for (int i=0; i<n; i++) { values.add(i); } values.clear();'));
  assert.equal(r.memoryPatternFlags.allocationAndReleasePattern, true);
  assert.ok(r.limitations.includes('garbage collection'));
});

test('recognizes single-branch linear recursion', () => {
  const code = `class Main { static int sum(int n) { if (n <= 0) return 0; return n + sum(n - 1); } public static void main(String[] args) {} }`;
  assert.equal(analyzeComplexity(code).timeComplexity, 'O(n)');
});

test('recognizes recursive halving separately from branching recursion', () => {
  const code = `class Main { static int search(int n) { if (n <= 1) return 1; return search(n / 2); } public static void main(String[] args) {} }`;
  assert.equal(analyzeComplexity(code).timeComplexity, 'O(log n)');
});

test('fixed-size nested loops do not override a size-dependent quadratic algorithm', () => {
  const code = `class Main { static void work(int[] a) { for (int i=0;i<a.length;i++) { for (int j=0;j<a.length;j++) {} } for (int k=0;k<5;k++) {} } public static void main(String[] args) {} }`;
  assert.equal(analyzeComplexity(code).timeComplexity, 'O(n²)');
});
