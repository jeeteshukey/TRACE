import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './styles.css';

const starter = `public class Main {
    public static void main(String[] args) {
        int sum = 0;
        for (int i = 0; i < 100000; i++) {
            sum += i;
        }
        System.out.println(sum);
    }
}`;

function App() {
  const [code, setCode] = useState(starter);
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [selectedLine, setSelectedLine] = useState(null);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('trace-theme') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('trace-theme', theme); } catch {}
  }, [theme]);

  const timeData = useMemo(() => result?.lines?.map(x => ({
    line: x.line,
    time: Number(x.timeMs),
    executions: x.executions,
    source: x.source,
    perExecution: x.executions ? Number(x.timeMs) / x.executions : 0
  })) || [], [result]);

  const memoryData = useMemo(() => result?.lines?.map(x => ({
    line: x.line,
    memory: Number(x.memoryAtMb),
    delta: Number(x.memoryDeltaMb),
    executions: x.executions,
    source: x.source
  })) || [], [result]);



  async function run() {
    setRunning(true); setError(''); setResult(null); setSelectedLine(null);
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, input })
      });
      const data = await r.json();
      if (!r.ok || data.error) setError(data.error || 'Request failed');
      else if (data.phase === 'compile') setError(data.error || 'Compilation failed');
      else setResult(data);
    } catch (e) {
      setError('Could not connect to TRACE backend. Make sure it is running on port 5000.');
    } finally { setRunning(false); }
  }

  function focusLine(line) {
    setSelectedLine(line);
    document.getElementById(`line-${line}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return <div className="app">
    <header className="topbar">
      <div><div className="brand">TRACE</div><div className="tagline">Visual Program Execution Profiler</div></div>
      <div className="headerActions"><button className="themeToggle" onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}</button><button className="run" onClick={run} disabled={running}>{running ? 'Analyzing…' : '▶ Run & Analyze'}</button></div>
    </header>
    <main>
      <section className="editorGrid">
        <div className="panel editorPanel">
          <div className="panelTitle">Java Source</div>
          <textarea value={code} onChange={e => setCode(e.target.value)} spellCheck="false" />
        </div>
        <div className="panel inputPanel">
          <div className="panelTitle">Standard Input</div>
          <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Optional program input" spellCheck="false" />
          <div className="hint">Class name must be <b>Main</b>. Prototype supports Java.</div>
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      {result && <>
        <section className="summary">
          <div className="metric"><span>Status</span><strong>{result.status}</strong></div>
          <div className="metric"><span>Process time</span><strong>{result.processTimeMs} ms</strong></div>
          <div className="metric"><span>Profiled line time</span><strong>{result.profiledLineTimeMs} ms</strong></div>
          <div className="metric"><span>Peak process memory</span><strong>{result.peakMemoryMb ?? '—'} MB</strong></div>
          <div className="metric complexityMetric"><span>Estimated time complexity</span><strong>{result.complexity.timeComplexity}</strong></div>
          <div className="metric complexityMetric"><span>Estimated space complexity</span><strong>{result.complexity.spaceComplexity}</strong></div>
        </section>

        <section className="complexityPanel panel">
          <div className="panelTitle">Complexity Analysis</div>
          <div className="complexityBody">
            <div className="complexityCard">
              <span>Time Complexity</span>
              <strong>{result.complexity.timeComplexity}</strong>
              <small>Confidence: {result.complexity.timeConfidence}</small>
            </div>
            <div className="complexityCard">
              <span>Auxiliary Space</span>
              <strong>{result.complexity.spaceComplexity}</strong>
              <small>Confidence: {result.complexity.spaceConfidence}</small>
            </div>
            <div className="complexityEvidence">
              <div className="evidenceTitle">Why TRACE reached this estimate</div>
              {result.complexity.evidence.map((e, i) => <div className="evidence" key={i}>• {e}</div>)}
              {result.complexity.inputSensitiveAnalysis?.length > 0 && <div className="caseAnalysis">
                <div className="evidenceTitle">Input-sensitive complexity</div>
                {result.complexity.inputSensitiveAnalysis.map((item, i) => <div className="caseItem" key={i}>
                  <b>{item.algorithm}</b>
                  <div className="caseValues">Best: {item.bestCase} · Average: {item.averageCase} · Worst: {item.worstCase}</div>
                  <small>{item.reason}</small>
                </div>)}
              </div>}
              {result.complexity.memoryPatternFlags?.allocationInsideLoop && <div className="evidence">• Memory pattern: allocation or collection growth detected inside a loop.</div>}
              {result.complexity.memoryPatternFlags?.allocationAndReleasePattern && <div className="evidence">• Memory pattern: allocation plus a possible clear/removal operation detected.</div>}
              {result.complexity.limitations && <div className="complexityLimitations"><b>Analysis coverage:</b> {result.complexity.limitations}</div>}
              <div className="complexityNote">{result.complexity.note}</div>
            </div>
          </div>
        </section>

        <section className="charts">
          <ChartCard
            title="Execution Time by Source Line"
            data={timeData}
            dataKey="time"
            yLabel="Accumulated time (ms)"
            tooltipExtra="time"
            onPointClick={focusLine}
          />
          <ChartCard
            title="Memory Snapshot by Source Line"
            data={memoryData}
            dataKey="memory"
            yLabel="Memory at line (MB)"
            tooltipExtra="memory"
            onPointClick={focusLine}
          />
        </section>


        <section className="panel tablePanel">
          <div className="panelTitle">Line Analysis</div>
          <div className="tableWrap"><table><thead><tr><th>Line</th><th>Source</th><th>Executions</th><th>Time (ms)</th><th>Per execution (µs)</th><th>Memory at line (MB)</th><th>Δ Memory (MB)</th></tr></thead>
          <tbody>{result.lines.map(x => <tr key={x.line} id={`line-${x.line}`} className={selectedLine === x.line ? 'selectedRow' : ''} onClick={() => setSelectedLine(x.line)}>
            <td>{x.line}</td><td className="source">{x.source}</td><td>{x.executions}</td><td>{Number(x.timeMs).toFixed(4)}</td><td>{((Number(x.timeMs) / Math.max(1, x.executions)) * 1000).toFixed(3)}</td><td>{Number(x.memoryAtMb).toFixed(4)}</td><td>{Number(x.memoryDeltaMb).toFixed(4)}</td>
          </tr>)}</tbody></table></div>
        </section>

        <section className="diagnosticsGrid">
          <div className="panel"><div className="panelTitle">Time accounting</div>
            <div className="diagnosticsBody">
              <div><span>Process time</span><b>{result.processTimeMs} ms</b></div>
              <div><span>Profiled runtime</span><b>{result.profiledRuntimeMs} ms</b></div>
              <div><span>Profiled line time</span><b>{result.profiledLineTimeMs} ms</b></div>
              <div><span>Unattributed profiled time</span><b>{result.unattributedMs} ms</b></div>
              <p>Process time includes starting and stopping the Java process. Line time is the accumulated time captured by TRACE's instrumentation.</p>
            </div>
          </div>
          <div className="panel"><div className="panelTitle">Program Output</div><pre>{result.stdout || '(no output)'}</pre></div>
        </section>

        <section className="panel notePanel"><div className="panelTitle">TRACE Measurement Notes</div><p>{result.note}</p></section>
      </>}

      {!result && !error && <div className="empty"><div className="emptyIcon">⌁</div><h2>Run your code to see what happened</h2><p>TRACE will execute the program locally, visualize measured execution time and memory, and estimate common Big-O classes from the code structure.</p></div>}
    </main>
    <footer>TRACE v0.6 • Local Java profiling prototype • Multi-language support is planned after Java reliability milestones</footer>
  </div>
}

function ChartCard({ title, data, dataKey, yLabel, tooltipExtra, onPointClick }) {
  return <div className="panel chartPanel"><div className="panelTitle">{title}</div><div className="chart"><ResponsiveContainer width="100%" height={300}>
    <LineChart data={data} margin={{ top: 10, right: 20, left: 5, bottom: 10 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="line" label={{ value: 'Source line', position: 'insideBottom', offset: -5 }} />
      <YAxis label={{ value: yLabel, angle: -90, position: 'insideLeft' }} />
      <Tooltip content={<SourceTooltip tooltipExtra={tooltipExtra} />} />
      <Line type="linear" dataKey={dataKey} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} onClick={(point) => onPointClick(point?.payload?.line)} />
    </LineChart>
  </ResponsiveContainer></div></div>
}

function SourceTooltip({ active, payload, tooltipExtra }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <div className="tooltip"><b>Line {d.line}</b><span>{tooltipExtra === 'time' ? `Time: ${Number(d.time).toFixed(4)} ms` : `Memory: ${Number(d.memory).toFixed(4)} MB`}</span><span>Executions: {d.executions}</span>{tooltipExtra === 'time' && <span>Per execution: {Number(d.perExecution * 1000).toFixed(3)} µs</span>}<code>{d.source}</code></div>
}


createRoot(document.getElementById('root')).render(<App />);
