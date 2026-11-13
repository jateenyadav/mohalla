import { useEffect, useState } from 'react';
import { api, type User } from './api';
import Mohalla from './components/Mohalla';

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('mh:theme');
      if (saved) return saved === 'dark';
    } catch { /* storage blocked */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('mh:theme', dark ? 'dark' : 'light'); } catch { /* storage blocked */ }
  }, [dark]);
  return [dark, () => setDark((d) => !d)] as const;
}

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-lg text-white shadow-md shadow-brand-600/30" aria-hidden>☀</span>
      <span className="text-lg font-extrabold tracking-tight">Moh<span className="text-brand-600 dark:text-brand-400">alla</span></span>
    </span>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, toggleTheme] = useTheme();
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ user: User | null }>('/auth/me').then((d) => setUser(d.user), () => {}).finally(() => setLoading(false));
  }, []);

  const signOut = async () => {
    await api('/auth/logout', { body: {} }).catch(() => {});
    setUser(null);
  };

  const deleteAccount = async () => {
    const password = user?.demo ? undefined : window.prompt('Type your password to delete your account and your town:');
    if (!user?.demo && !password) return;
    if (user?.demo && !window.confirm('Delete this demo account and its town?')) return;
    try {
      await api('/auth/account', { method: 'DELETE', body: { password } });
      setUser(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account.');
    }
  };

  const themeButton = (
    <button className="grid h-9 w-9 place-items-center rounded-xl text-lg hover:bg-white/70 dark:hover:bg-slate-800" onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? '☀️' : '🌙'}</button>
  );

  if (loading) return <div className="grid min-h-dvh place-items-center"><Logo /></div>;
  if (!user) return <Landing onUser={setUser} themeButton={themeButton} />;

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 pb-6">
      <header className="no-print flex items-center justify-between gap-3 py-4">
        <Logo />
        <div className="flex items-center gap-1">
          {themeButton}
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-xl px-2 text-sm font-semibold hover:bg-white/70 dark:hover:bg-slate-800">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-600/20 dark:text-brand-400">{user.name.slice(0, 1).toUpperCase()}</span>
              <span className="hidden sm:inline">{user.demo ? 'Demo' : user.name}</span>
            </summary>
            <div className="card absolute right-0 z-20 mt-2 w-56 p-2 text-sm">
              {user.demo && <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Demo account: everything is deleted after 24 hours.</p>}
              <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={signOut}>Sign out</button>
              <button className="w-full rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={deleteAccount}>Delete account</button>
            </div>
          </details>
        </div>
      </header>

      {error && <p role="alert" className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
      <main className="flex-1">
        <Mohalla dark={dark} />
      </main>

    </div>
  );
}

function Landing({ onUser, themeButton }: { onUser: (u: User) => void; themeButton: React.ReactNode }) {
  const [mode, setMode] = useState<'none' | 'login' | 'register'>('none');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async (path: string, body: object) => {
    setBusy(true);
    setError('');
    try {
      onUser((await api<{ user: User }>(path, { body })).user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4">
      <header className="flex items-center justify-between py-4"><Logo />{themeButton}</header>
      <main className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-2">
        <div>
          <p className="inline-block rounded-full bg-accent-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-600 dark:text-accent-400">Free · An AI town with an Indian heart</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Eight neighbours.<br />
            <span className="text-brand-600 dark:text-brand-400">One very chatty lane.</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-slate-600 dark:text-slate-300">In Mohalla, AI residents wake up, plan their day, run the chai stall, play cricket and gossip. Watch, talk to anyone, or whisper some news and see how fast it travels. A full town day takes about 8 minutes.</p>
          <ul className="mt-6 space-y-2 text-sm">
            {['Each resident has memories, plans and a nightly diary', 'Whisper news and track exactly who told whom', 'Your own private town: nobody else sees your whispers', 'When the free AI runs out, life goes on with scripted routines'].map((f) => (
              <li key={f} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] text-white">✓</span>{f}</li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <button className="btn-accent px-6 py-3 text-base" disabled={busy} onClick={() => go('/auth/demo', {})}>Try the demo</button>
            <button className="btn-ghost px-6 py-3 text-base" onClick={() => setMode(mode === 'login' ? 'none' : 'login')}>Sign in</button>
          </div>

          {mode !== 'none' && (
            <form className="card mt-5 max-w-sm space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void go(mode === 'login' ? '/auth/login' : '/auth/register', mode === 'login' ? { email: form.email, password: form.password } : form); }}>
              {mode === 'register' && <input className="field" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" />}
              <input className="field" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" />
              <input className="field" type="password" placeholder="Password (8+ characters)" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button className="btn-primary w-full" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
              <button type="button" className="w-full text-sm text-slate-500 hover:underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
              </button>
            </form>
          )}
          {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
        </div>

        <div className="relative mx-auto w-full max-w-sm" aria-hidden>
          <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-400/30 to-accent-400/30 blur-2xl" />
          <div className="card space-y-3 p-5 shadow-xl">
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
              {[['☕', 'Raju’s Chai', 'bg-amber-100 text-amber-900'], ['🏏', 'Cricket Ground', 'bg-green-200 text-green-900'], ['🛒', 'Gupta Kirana', 'bg-amber-100 text-amber-900']].map(([i, n, c]) => <div key={n} className={`rounded-xl p-3 ${c}`}><div className="text-2xl">{i}</div>{n}</div>)}
            </div>
            <div className="space-y-2 text-sm">
              <p><b style={{ color: '#eb6834' }}>Raju:</b> Arre Joseph-ji, did you hear? The ground is getting floodlights!</p>
              <p><b style={{ color: '#e87ba4' }}>Joseph:</b> Floodlights! In 1983 we played till the ball vanished in the dark…</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-xs dark:bg-amber-500/10"><b>📣 News tracker</b><br />You → Raju 08:10 → Joseph 08:42 → Arjun 09:15 · 4 of 8 know</div>
            <p className="rounded-xl bg-slate-50 p-3 text-xs italic text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">📔 Arjun, day 1: “Everyone is talking about floodlights. Night matches!! Must finish maths homework first or Amma will kill me.”</p>
          </div>
        </div>
      </main>
      <footer className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        Built by <a className="font-semibold underline" href="https://github.com/jateenyadav">Jateen Yadav</a> · <a className="underline" href="https://github.com/jateenyadav/mohalla">Source code</a>
      </footer>
    </div>
  );
}
