import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildAudioScript, estimateSeconds } from '../services/audioScript.js';
import Icon from './Icon.jsx';

const SPEEDS = [0.8, 1, 1.2];

/**
 * AudioSummary — "Listen" card for students who learn by hearing. Reads a
 * short conversational script (key points, key ideas, mini-quiz) aloud with
 * the browser's built-in voice. Works offline when the device has a voice
 * installed; the script is always shown so it can be read instead.
 */
export default function AudioSummary({ title, content }) {
  const lines = useMemo(() => buildAudioScript({ title, content }), [title, content]);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const [status, setStatus] = useState('idle'); // idle | playing | paused
  const [current, setCurrent] = useState(-1);
  const [rate, setRate] = useState(1);
  const [open, setOpen] = useState(false);
  const run = useRef({ id: 0, timer: null });

  function stop() {
    run.current.id += 1;
    clearTimeout(run.current.timer);
    if (supported) window.speechSynthesis.cancel();
    setStatus('idle');
    setCurrent(-1);
  }

  // Stop speaking when leaving the page or when the script changes.
  useEffect(() => stop, [lines]);

  function speakFrom(index, runId) {
    if (runId !== run.current.id) return;
    if (index >= lines.length) { setStatus('idle'); setCurrent(-1); return; }
    const line = lines[index];
    setCurrent(index);
    const utterance = new window.SpeechSynthesisUtterance(line.text);
    utterance.rate = rate;
    utterance.lang = 'en-US';
    const next = () => {
      if (runId !== run.current.id) return;
      run.current.timer = setTimeout(() => speakFrom(index + 1, runId), line.pauseAfterMs ?? 250);
    };
    utterance.onend = next;
    utterance.onerror = next;
    window.speechSynthesis.speak(utterance);
  }

  function play() {
    if (!supported) return;
    if (status === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
      return;
    }
    window.speechSynthesis.cancel();
    run.current.id += 1;
    setStatus('playing');
    setOpen(true);
    speakFrom(0, run.current.id);
  }

  function pause() {
    if (!supported) return;
    window.speechSynthesis.pause();
    setStatus('paused');
  }

  if (lines.length === 0) return null;
  const seconds = estimateSeconds(lines);
  const minutes = Math.max(1, Math.round(seconds / 60));

  return (
    <section className="sb-card p-5" aria-labelledby="audio-summary-title">
      <div className="flex flex-wrap items-center gap-3">
        <span className="sb-tile" style={{ background: 'var(--sb-violet-bg)', color: 'var(--sb-violet)' }}><Icon name="sound" /></span>
        <div className="flex-1 basis-[180px] min-w-0">
          <h3 id="audio-summary-title" className="font-bold">Listen to this lesson</h3>
          <p className="sb-sub">About {minutes} minute{minutes === 1 ? '' : 's'}, with a quick check at the end.</p>
        </div>
        {supported && (
          <div className="flex items-center gap-2">
            {status === 'playing' ? (
              <button type="button" className="sb-btn" onClick={pause}>Pause</button>
            ) : (
              <button type="button" className="sb-btn" onClick={play}>{status === 'paused' ? 'Resume' : 'Play'}</button>
            )}
            {status !== 'idle' && <button type="button" className="sb-btn-ghost" onClick={stop}>Stop</button>}
          </div>
        )}
      </div>

      {supported ? (
        <div className="flex flex-wrap items-center gap-2 mt-3" role="group" aria-label="Reading speed">
          <span className="text-xs sb-muted">Speed</span>
          {SPEEDS.map(s => (
            <button
              key={s}
              type="button"
              className="sb-chip"
              style={{ minHeight: 44, padding: '0 14px', ...(rate === s ? { background: 'var(--sb-sky)', color: 'var(--sb-primary)' } : {}) }}
              aria-pressed={rate === s}
              disabled={status !== 'idle'}
              onClick={() => setRate(s)}
            >
              {s === 1 ? 'Normal' : s < 1 ? 'Slow' : 'Fast'}
            </button>
          ))}
          {status !== 'idle' && <span className="text-xs sb-muted">Stop to change speed.</span>}
        </div>
      ) : (
        <p className="sb-sub mt-3">This browser cannot read aloud. You can still read the script below.</p>
      )}

      <details className="mt-3" open={open || !supported} onToggle={e => setOpen(e.currentTarget.open)}>
        <summary className="text-sm font-bold cursor-pointer py-3" style={{ color: 'var(--sb-primary)' }}>Read the script</summary>
        <ol className="space-y-2 text-sm leading-relaxed">
          {lines.map((line, i) => (
            <li
              key={i}
              className="rounded-lg px-3 py-1.5"
              aria-current={i === current ? 'true' : undefined}
              style={{
                background: i === current ? 'var(--sb-sky)' : 'transparent',
                fontWeight: line.kind === 'question' ? 700 : 400,
                color: line.kind === 'intro' || line.kind === 'outro' ? 'var(--sb-muted)' : 'var(--sb-ink)',
              }}
            >
              {line.text}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
