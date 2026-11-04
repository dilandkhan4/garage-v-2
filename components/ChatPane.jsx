'use client';
import { useEffect, useRef, useState } from 'react';
export default function ChatPane({ channel, initial, labels }) {
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState(''); const [job, setJob] = useState(''); const [err, setErr] = useState('');
  const box = useRef(null); const last = useRef(initial.length ? initial[initial.length - 1].id : 0);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs.length]);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/chat/messages?channel=${channel}&after=${last.current}`, { cache: 'no-store' });
        if (r.ok) { const rows = await r.json(); if (rows.length && !stop) { last.current = rows[rows.length - 1].id; setMsgs((m) => [...m, ...rows]); } }
      } catch {}
    };
    const i = setInterval(tick, 3000); return () => { stop = true; clearInterval(i); };
  }, [channel]);
  async function send(e) {
    e.preventDefault(); if (!text.trim()) return; setErr('');
    const r = await fetch('/api/chat/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, body: text, job_id: job || null }) });
    if (!r.ok) { setErr(labels.error); return; }
    setText(''); setJob('');
    const rr = await fetch(`/api/chat/messages?channel=${channel}&after=${last.current}`, { cache: 'no-store' });
    if (rr.ok) { const rows = await rr.json(); if (rows.length) { last.current = rows[rows.length - 1].id; setMsgs((m) => [...m, ...rows]); } }
  }
  return (<div className="pane card" style={{ padding: 10, margin: 0 }}>
    <div className="msgs" ref={box}>{msgs.map((m) => (<div key={m.id} className={`msg ${m.mine ? 'me' : ''}`}><small>{m.mine ? labels.you : m.full_name} · {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>{m.body}{m.job_id && <div><a href={`/app/jobs/${m.job_id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>{labels.job} #{m.job_id}</a></div>}</div>))}
      {msgs.length === 0 && <div className="mute">{labels.empty}</div>}</div>
    <form onSubmit={send} className="row" style={{ marginTop: 8 }}><input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={labels.placeholder} maxLength={4000} />
      <input value={job} onChange={(e) => setJob(e.target.value.replace(/\D/g, ''))} placeholder={labels.jobPh} style={{ width: 90 }} /><button className="btn">{labels.send}</button></form>{err && <div className="alert bad" style={{ marginTop: 6 }}>{err}</div>}</div>);
}
