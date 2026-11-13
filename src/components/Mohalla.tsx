import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { PLACE, clock } from '../../shared/town-map.js';
import { townNow, type ResidentInfo, type Rumour, type Town } from '../lib/types';
import TownCanvas from './TownCanvas';

const TICK_MS = 6000;
type Tab = 'feed' | 'person' | 'news';

export default function Mohalla({ dark }: { dark: boolean }) {
  const [town, setTown] = useState<Town | null>(null);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('feed');
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const [, force] = useState(0);
  const inFlight = useRef(false);

  const apply = (t: Town) => { setTown(t); setReceivedAt(Date.now()); };
  const tick = useCallback(async () => {
    if (inFlight.current || document.hidden) return;
    inFlight.current = true;
    try { apply(await api<Town>('/tick', { body: {} })); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'The town could not update.'); } finally { inFlight.current = false; }
  }, []);

  useEffect(() => { api<Town>('/town').then(apply, (e) => setError(e instanceof Error ? e.message : 'Could not load the town.')).then(() => tick()); }, [tick]);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(tick, TICK_MS);
    const c = setInterval(() => force((x) => x + 1), 1000); // keep the clock ticking between server ticks
    return () => { clearInterval(t); clearInterval(c); };
  }, [tick, paused]);

  if (!town) return <div className="card grid h-96 place-items-center text-slate-500">{error || 'Waking up the mohalla…'}</div>;
  const now = townNow(town, paused ? Date.now() : receivedAt, paused ? Date.now() : Date.now());

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
      <section className="space-y-3">
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <p className="flex items-center gap-3">
            <span className="num text-2xl font-extrabold" data-testid="clock">{clock(now % 1440)}</span>
            <span className="text-sm text-slate-500">Day {town.day}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-semibold ${town.ai.mode === 'ai' ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-brand-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'}`} title="AI calls left today for your town">
              {town.ai.mode === 'ai' ? `🧠 AI on · ${town.ai.left} thoughts left today` : '📜 Scripted mode (AI budget used up)'}
            </span>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setPaused(!paused)}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
          </div>
        </div>
        <div className="card overflow-hidden p-1.5">
          <TownCanvas town={town} receivedAt={paused ? Date.now() : receivedAt} selected={selected} onSelect={(id) => { setSelected(id); if (id) setTab('person'); }} dark={dark} />
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Residents">
          {town.residents.map((r) => (
            <li key={r.id}>
              <button className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition hover:-translate-y-px ${selected === r.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-600/15' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`} onClick={() => { setSelected(r.id); setTab('person'); }}>
                <span className="h-3 w-3 rounded-full" style={{ background: r.colour }} />{r.short}
                <span className="hidden text-xs text-slate-500 sm:inline">· {r.walk && now < r.walk.end ? `→ ${PLACE[r.walk.to].name}` : PLACE[r.walk ? r.walk.to : r.loc].name}</span>
              </button>
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      </section>

      <aside className="space-y-3">
        <nav className="inline-flex rounded-2xl bg-white/80 p-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/80 dark:ring-slate-800" aria-label="Panel">
          {(['feed', 'person', 'news'] as Tab[]).map((t) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)} className={`rounded-xl px-4 py-1.5 text-sm font-semibold ${tab === t ? 'bg-brand-600 text-white shadow' : 'text-slate-600 dark:text-slate-300'}`}>{t === 'feed' ? 'Live' : t === 'person' ? 'Resident' : `News${town.rumours ? ` (${town.rumours})` : ''}`}</button>)}
        </nav>
        {tab === 'feed' && <Feed town={town} />}
        {tab === 'person' && (selected ? <Person id={selected} town={town} onWhisper={tick} /> : <p className="card p-5 text-sm text-slate-500">Tap someone on the map to see their day, memories and diary, talk to them, or whisper some news.</p>)}
        {tab === 'news' && <News town={town} />}
        <button className="w-full text-xs text-slate-400 hover:text-rose-600" onClick={async () => { if (window.confirm('Start the town over from day 1? Memories, news and diaries are cleared.')) { apply(await api<Town>('/town/reset', { body: {} })); setSelected(null); } }}>Reset the town</button>
      </aside>
    </div>
  );
}

const name = (town: Town, id: string) => town.residents.find((r) => r.id === id)?.short ?? id;

function Feed({ town }: { town: Town }) {
  const last = town.convos.at(-1);
  return (
    <section className="space-y-3">
      {last && (
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Latest conversation · {PLACE[last.place].name} · {clock(last.at % 1440)}{last.ai ? '' : ' · scripted'}</p>
          <ol className="mt-2 space-y-1.5 text-sm" data-testid="convo">
            {last.lines.map((l, i) => <li key={i}><b>{name(town, l.speaker)}:</b> {l.text}</li>)}
          </ol>
        </div>
      )}
      <ol className="card max-h-[50dvh] space-y-1.5 overflow-y-auto p-4 text-sm" data-testid="feed">
        {[...town.events].reverse().map((e, i) => <li key={i} className="flex gap-2"><span className="num shrink-0 text-xs text-slate-400">{clock(e.at % 1440)}</span><span>{e.text}</span></li>)}
      </ol>
    </section>
  );
}

function Person({ id, town, onWhisper }: { id: string; town: Town; onWhisper: () => void }) {
  const [info, setInfo] = useState<ResidentInfo | null>(null);
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState<{ you: string; them: string }[]>([]);
  const [news, setNews] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => api<ResidentInfo>(`/residents/${id}`).then(setInfo), [id]);
  useEffect(() => { setChat([]); setInfo(null); void load(); }, [id, load]);
  useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const me = town.residents.find((r) => r.id === id)!;

  const talk = async () => {
    setBusy(true); setError('');
    try { const { reply } = await api<{ reply: string }>(`/residents/${id}/talk`, { body: { message: msg } }); setChat((c) => [...c, { you: msg, them: reply }]); setMsg(''); void load(); } catch (e) { setError(e instanceof Error ? e.message : 'No answer.'); } finally { setBusy(false); }
  };
  const whisper = async () => {
    setBusy(true); setError('');
    try { await api(`/residents/${id}/whisper`, { body: { news } }); setNews(''); onWhisper(); void load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not whisper.'); } finally { setBusy(false); }
  };

  if (!info) return <div className="card h-64 animate-pulse" />;
  return (
    <section className="card space-y-4 p-4" data-testid="person">
      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-bold text-white" style={{ background: info.colour }}>{info.name[0]}</span>
        <div>
          <h2 className="text-lg font-extrabold">{info.name}, {info.age}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{info.job[0].toUpperCase() + info.job.slice(1)}.</p>
          <p className="text-xs text-slate-500">Now: {me.activity || '…'}</p>
        </div>
      </header>
      <details open>
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-500">Today’s plan {info.planned ? '(planned by the AI)' : '(usual routine)'}</summary>
        <ol className="mt-2 space-y-0.5 text-sm">{info.plan.map((p, i) => <li key={i}><span className="num text-xs text-slate-400">{clock(p.minute)}</span> {PLACE[p.place]?.icon} {p.activity}</li>)}</ol>
      </details>
      <details>
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-500">Memories ({info.memories.length})</summary>
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm" data-testid="memories">{info.memories.map((m, i) => <li key={i}><span className="num text-xs text-slate-400">d{Math.floor(m.at / 1440) + 1} {clock(m.at % 1440)}</span> {m.kind === 'reflection' ? '💭 ' : m.kind === 'news' ? '📣 ' : ''}{m.text}</li>)}</ul>
      </details>
      {info.diaries[0] && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10" data-testid="diary">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">📔 Diary · day {info.diaries[0].day}</p>
          <p className="mt-1 italic">{info.diaries[0].text}</p>
        </div>
      )}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Talk to {(me?.short ?? info.name)}</p>
        {chat.length > 0 && <ul className="mt-2 space-y-2 text-sm" data-testid="talk">{chat.map((c, i) => <li key={i}><p className="text-slate-500">You: {c.you}</p><p><b>{(me?.short ?? info.name)}:</b> {c.them}</p></li>)}</ul>}
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (msg.trim()) void talk(); }}>
          <input className="field" value={msg} maxLength={300} onChange={(e) => setMsg(e.target.value)} placeholder="Say something…" aria-label="Message" />
          <button className="btn-primary" disabled={busy || !msg.trim()}>Say</button>
        </form>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">🤫 Whisper some news</p>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (news.trim().length >= 5) void whisper(); }}>
          <input className="field" value={news} maxLength={160} onChange={(e) => setNews(e.target.value)} placeholder="e.g. The ground is getting floodlights!" aria-label="News" />
          <button className="btn-accent" disabled={busy || news.trim().length < 5}>Whisper</button>
        </form>
        <p className="mt-1 text-xs text-slate-500">Then watch the News tab to see who tells whom.</p>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    </section>
  );
}

function News({ town }: { town: Town }) {
  const [list, setList] = useState<Rumour[] | null>(null);
  useEffect(() => { api<{ rumours: Rumour[] }>('/rumours').then((d) => setList(d.rumours), () => setList([])); }, [town.version]);
  if (!list) return <div className="card h-40 animate-pulse" />;
  if (!list.length) return <p className="card p-5 text-sm text-slate-500">No news yet. Pick a resident and whisper something; gossip-lovers like Raju and Joseph spread it fastest.</p>;
  return (
    <ul className="space-y-3" data-testid="news">
      {list.map((r) => (
        <li key={r.id} className="card p-4">
          <p className="font-semibold">“{r.text}”</p>
          <p className="mt-1 text-xs text-slate-500">{r.knowers.length} of {town.residents.length} know · started with {name(town, r.origin)} at {clock(r.at % 1440)} on day {Math.floor(r.at / 1440) + 1}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-accent-500" style={{ width: `${(r.knowers.length / town.residents.length) * 100}%` }} /></div>
          {r.spread.length > 0 && (
            <ol className="mt-3 space-y-1 text-sm">
              {r.spread.map((s, i) => <li key={i}><span className="num text-xs text-slate-400">{clock(s.at % 1440)}</span> {name(town, s.from)} <span className="text-slate-400">→</span> <b>{name(town, s.to)}</b></li>)}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}
