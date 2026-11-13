import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { startFakeAi } from '../dev/fake-ai.mjs';
import fixtures from '../dev/fixtures.mjs';
import { createAi, providersFromEnv } from '../lib/ai.js';
import { memoryCounterStore } from '../lib/limits.js';
import { connectDb } from '../lib/db.js';
import { createApp } from '../app.js';
import { setTestClock } from '../routes.js';

let mem, fake, app, noAiApp;
let clockMs = Date.UTC(2026, 10, 13, 10);
before(async () => {
  mem = await MongoMemoryServer.create();
  fake = await startFakeAi({ fixtures });
  setTestClock(() => clockMs);
  const db = () => connectDb(mem.getUri(), 'mohalla-test');
  app = createApp({ ai: createAi({ providers: providersFromEnv({ GROQ_API_KEY: 'x', GROQ_BASE_URL: fake.url }) }), counters: memoryCounterStore(), db });
  noAiApp = createApp({ ai: createAi({ providers: [] }), counters: memoryCounterStore(), db });
});
after(async () => { setTestClock(null); await mongoose.disconnect(); await mem.stop(); await fake.close(); });

const demo = async (a = app) => {
  const agent = request.agent(a);
  await agent.post('/api/auth/demo').send({}).expect(201);
  return agent;
};
/** Run n ticks, `sec` real seconds apart. */
const ticks = async (agent, n, sec = 6) => {
  let last;
  for (let i = 0; i < n; i++) { clockMs += sec * 1000; last = (await agent.post('/api/tick').send({}).expect(200)).body; }
  return last;
};

test('health and login required', async () => {
  await request(app).get('/api/health').expect(200);
  await request(app).post('/api/tick').send({}).expect(401);
});

test('a fresh town: 8 residents, morning, time moves with ticks', async () => {
  const agent = await demo();
  const t0 = (await agent.get('/api/town').expect(200)).body;
  assert.equal(t0.residents.length, 8);
  assert.equal(t0.day, 1);
  const t1 = await ticks(agent, 3);
  assert.ok(t1.minute > t0.minute + 30);
  assert.ok(t1.residents.some((r) => r.planned), 'the AI planned some residents');
  assert.ok(t1.events.length > 1);
});

test('whispered news spreads through conversations, and the tracker shows who told whom', async () => {
  const agent = await demo();
  await agent.post('/api/residents/raju/whisper').send({ news: 'The cricket ground is getting floodlights!' }).expect(201);
  let spread = [];
  for (let i = 0; i < 40 && !spread.length; i++) {
    await ticks(agent, 1, 8);
    spread = (await agent.get('/api/rumours').expect(200)).body.rumours[0].spread;
  }
  assert.ok(spread.length >= 1, 'news reached someone');
  assert.equal(spread[0].from, 'raju');
  const to = spread[0].to;
  const r = (await agent.get(`/api/residents/${to}`).expect(200)).body;
  assert.ok(r.memories.some((m) => /floodlights/.test(m.text)), 'the listener remembers it');
});

test('talk to a resident; whisper validation', async () => {
  const agent = await demo();
  const res = await agent.post('/api/residents/joseph/talk').send({ message: 'Tell me about 1983' }).expect(200);
  assert.match(res.body.reply, /chai/);
  const j = (await agent.get('/api/residents/joseph').expect(200)).body;
  assert.ok(j.memories.some((m) => /1983/.test(m.text)));
  await agent.post('/api/residents/nobody/talk').send({ message: 'hi' }).expect(404);
  await agent.post('/api/residents/raju/whisper').send({ news: 'hi' }).expect(400);
});

test('a whole day: diaries get written and a new day begins', async () => {
  const agent = await demo();
  const s = await ticks(agent, 50, 20); // 50 × 40 town minutes, more than one day
  assert.ok(s.day >= 2);
  const d = (await agent.get('/api/residents/meena').expect(200)).body;
  assert.ok(d.diaries.length >= 1);
  assert.match(d.diaries[0].text, /Dear diary/);
});

test('with no AI the town still runs on scripted routines and talk is refused politely', async () => {
  const agent = await demo(noAiApp);
  const s = await ticks(agent, 20, 8);
  assert.equal(s.ai.mode, 'scripted');
  assert.ok(s.residents.some((r) => r.walk || r.loc !== 'home_yadav'));
  const res = await agent.post('/api/residents/raju/talk').send({ message: 'hello' }).expect(429);
  assert.match(res.body.error, /budget/);
});

test('a second tick during a running one is skipped (lease)', async () => {
  const agent = await demo();
  await agent.get('/api/town').expect(200);
  await mongoose.connection.collection('towns').updateMany({}, { $set: { leaseUntil: new Date(clockMs + 60000) } });
  const res = await agent.post('/api/tick').send({}).expect(200);
  assert.equal(res.body.busy, true);
  await mongoose.connection.collection('towns').updateMany({}, { $set: { leaseUntil: new Date(0) } });
});

test('reset and account deletion clear the town', async () => {
  const owner = request.agent(app);
  await owner.post('/api/auth/register').send({ name: 'Asha', email: 'asha@example.com', password: 'longpassword' }).expect(201);
  await owner.post('/api/residents/pooja/whisper').send({ news: 'Pooja is opening a second shop.' }).expect(201);
  const reset = await owner.post('/api/town/reset').send({}).expect(200);
  assert.equal(reset.body.rumours, 0);
  const me = await owner.get('/api/auth/me').expect(200);
  await owner.delete('/api/auth/account').send({ password: 'longpassword' }).expect(200);
  for (const c of ['towns', 'townmemories', 'convos', 'rumours', 'diaries']) assert.equal(await mongoose.connection.collection(c).countDocuments({ userId: me.body.user.id }), 0, c);
});
