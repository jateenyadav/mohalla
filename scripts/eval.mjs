// One full town day with the real free AI, measured: tick time (must stay under Netlify's ~10 s), AI calls used,
// conversations, how many residents planned with the AI, and how far one whispered piece of news travels by night.
// Runs the real API in-process with a simulated clock (one tick = 6 s of watching). Needs GROQ_API_KEY.
//   node scripts/eval.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

for (const file of [resolve('.env'), resolve(process.env.HOME || '', 'Desktop/RND/.secrets/shared.env')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) { console.error('Add GROQ_API_KEY to ~/Desktop/RND/.secrets/shared.env first.'); process.exit(1); }
const FAST = process.env.EVAL_FAST === '1';

const { createApp } = await import('../server/app.js');
const { createAi } = await import('../server/lib/ai.js');
const { memoryCounterStore } = await import('../server/lib/limits.js');
const { connectDb } = await import('../server/lib/db.js');
const { setTestClock } = await import('../server/routes.js');

let clockMs = Date.now();
setTestClock(() => clockMs);
const mem = await MongoMemoryServer.create();
const ai = createAi({ budgetMs: 8000 });
const app = createApp({ ai, counters: memoryCounterStore(), db: () => connectDb(mem.getUri(), 'mohalla-eval') });
const agent = request.agent(app);
await agent.post('/api/auth/demo').send({}).expect(201);
await agent.get('/api/town').expect(200);
await agent.post('/api/residents/raju/whisper').send({ news: 'The cricket ground is getting floodlights for night matches!' }).expect(201);

const times = [];
let state;
for (let i = 0; i < 400; i++) {
  clockMs += 6000;
  const t0 = Date.now();
  state = (await agent.post('/api/tick').send({}).expect(200)).body;
  times.push(Date.now() - t0);
  if (i % 10 === 0) process.stdout.write(`\rday ${state.day} ${Math.floor(state.minute / 60)}:${String(Math.floor(state.minute % 60)).padStart(2, '0')}  ticks ${i + 1}  AI left ${state.ai.left}   `);
  if (state.day >= 2) break;
  if (!FAST) await new Promise((r) => setTimeout(r, 1500)); // a little breathing room for per-minute limits
}
const db = mongoose.connection;
const [convos, aiConvos, diaries, aiDiaries, rumour, reflections] = await Promise.all([
  db.collection('convos').countDocuments(), db.collection('convos').countDocuments({ ai: true }),
  db.collection('diaries').countDocuments(), db.collection('diaries').countDocuments({ ai: true }),
  db.collection('rumours').findOne({}), db.collection('townmemories').countDocuments({ kind: 'reflection' }),
]);
const planned = (await db.collection('towns').findOne({})).residents.filter((r) => r.plan?.length).length;
await mongoose.disconnect();
await mem.stop();

times.sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
const r = {
  date: new Date().toISOString().slice(0, 10),
  models: ai.status().providers.map((p) => `${p.name}:${p.model}`).join(', '),
  ticks: times.length, p50: pct(0.5), p90: pct(0.9), max: times.at(-1), over10s: times.filter((t) => t > 10000).length,
  aiUsed: 150 - state.ai.left, convos, aiConvos, planned, reflections, diaries, aiDiaries,
  newsKnowers: rumour?.knowers.length ?? 0, newsPath: (rumour?.spread ?? []).map((s) => `${s.from}→${s.to}`),
};
const out = FAST ? 'docs/eval-results.fake' : 'docs/eval-results';
mkdirSync('docs', { recursive: true });
writeFileSync(`${out}.json`, JSON.stringify(r, null, 2));
writeFileSync(`${out}.md`, `# Mohalla: one town day, measured (${r.date})

A full day (06:00 to 22:30) in a fresh town, ticking every 6 s of watching, with real free AI (${r.models}).
At 07:40 a visitor whispered one piece of news to Raju.

| Measure | Result |
|---|---|
| Ticks for the day | ${r.ticks} |
| Tick time, median / 90th percentile / max | ${r.p50} ms / ${r.p90} ms / ${r.max} ms |
| Ticks over Netlify's 10 s limit | ${r.over10s} |
| AI calls used (budget 150) | ${r.aiUsed} |
| Residents with an AI-planned day | ${r.planned} / 8 |
| Conversations (AI-written) | ${r.convos} (${r.aiConvos}) |
| Reflections | ${r.reflections} |
| Diaries (AI-written) | ${r.diaries} (${r.aiDiaries}) |
| **Residents who knew the news by night** | **${r.newsKnowers} / 8** (${r.newsPath.join(', ') || 'no one'}) |

Re-run: \`node scripts/eval.mjs\`.
`);
console.log(`\n${JSON.stringify(r)}\n→ ${out}.md`);
