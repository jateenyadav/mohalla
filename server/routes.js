// Mohalla API. Each visitor has their own private town. There is no always-on server: the town only runs while
// someone watches. The browser calls POST /tick every few seconds; a lease in MongoDB lets one tick run at a time,
// and each tick makes at most 2 AI calls. When the daily AI budget is used up, residents follow scripted routines.

import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { route, parse, ApiError, log } from './lib/http.js';
import { dayKey } from './lib/limits.js';
import { PLACE, PLACE_IDS, RATE } from '../shared/town-map.js';
import { RESIDENT, RESIDENTS, planAt } from './residents.js';
import { SYSTEM, absMin, advance, convoPrompt, convoSchema, diaryPrompt, diarySchema, moves, pickPair, planPrompt, planSchema, reflectPrompt, reflectSchema, retrieve, scriptedConvo, talkPrompt, toPlan } from './town.js';

export const BIG_BODY = [];

// Tests drive time by hand; real requests use the wall clock.
let nowFn = () => Date.now();
export const setTestClock = (fn) => { nowFn = fn || (() => Date.now()); };
const AI_PER_TOWN_DAY = Number(process.env.TOWN_AI_PER_DAY || 150);
const AI_ALL_TOWNS_DAY = Number(process.env.TOWN_AI_GLOBAL || 3000);
const AI_PER_TICK = 2;
const CONVO_GAP_MIN = 12;
const REFLECT_AT = 30;

function models() {
  if (mongoose.models.Town) return { Town: mongoose.models.Town, Mem: mongoose.models.TownMemory, Convo: mongoose.models.Convo, Rumour: mongoose.models.Rumour, Diary: mongoose.models.Diary };
  const Town = mongoose.model('Town', new mongoose.Schema({
    userId: { type: String, unique: true },
    day: Number, minute: Number, lastTickAt: Date, leaseUntil: { type: Date, default: () => new Date(0) }, version: { type: Number, default: 0 },
    residents: [mongoose.Schema.Types.Mixed],
    pairLast: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastConvoAt: { type: Number, default: -1e9 },
    diaryDay: { type: Number, default: 0 },
    events: [{ _id: false, at: Number, text: String }],
    aiDay: String, aiUsed: { type: Number, default: 0 },
  }, { minimize: false }));
  const idx = { userId: String, resident: String };
  const Mem = mongoose.model('TownMemory', new mongoose.Schema({ ...idx, text: String, importance: Number, at: Number, kind: String }).index({ userId: 1, resident: 1, at: -1 }));
  const Convo = mongoose.model('Convo', new mongoose.Schema({ userId: { type: String, index: true }, a: String, b: String, place: String, at: Number, lines: [{ _id: false, speaker: String, text: String }], ai: Boolean, shared: [String] }));
  const Rumour = mongoose.model('Rumour', new mongoose.Schema({ userId: { type: String, index: true }, text: String, origin: String, at: Number, spread: [{ _id: false, from: String, to: String, at: Number }], knowers: [String] }));
  const Diary = mongoose.model('Diary', new mongoose.Schema({ ...idx, day: Number, text: String, ai: Boolean }));
  return { Town, Mem, Convo, Rumour, Diary };
}

function freshTown(userId) {
  const minute = 7 * 60 + 40;
  return {
    userId, day: 1, minute, lastTickAt: new Date(), version: 0, pairLast: {}, lastConvoAt: -1e9, diaryDay: 0,
    residents: RESIDENTS.map((r) => {
      const [, place, activity] = planAt(r.routine, minute, r.home);
      return { id: r.id, loc: place, walk: null, activity, busyUntil: 0, plan: null, planDay: 0, unreflected: 0 };
    }),
    events: [{ at: minute, text: 'Morning in Mohalla. The chai is on.' }],
  };
}

const MAX_EVENTS = 40;
const pushEvents = (town, list) => { town.events = [...town.events, ...list].slice(-MAX_EVENTS); };

function stateView(t, convos, rumourCount, aiLeft) {
  return {
    day: t.day, minute: t.minute, rate: RATE, serverTime: nowFn(), version: t.version,
    residents: t.residents.map((r) => ({ id: r.id, name: RESIDENT[r.id].name, short: RESIDENT[r.id].short, colour: RESIDENT[r.id].colour, loc: r.loc, walk: r.walk, activity: r.activity, busyUntil: r.busyUntil || 0, planned: r.planDay === t.day })),
    convos: convos.map((c) => ({ id: String(c._id), a: c.a, b: c.b, place: c.place, at: c.at, lines: c.lines, ai: c.ai })),
    events: t.events.slice(-25),
    rumours: rumourCount,
    ai: { left: Math.max(0, aiLeft), mode: aiLeft > 0 ? 'ai' : 'scripted' },
  };
}

export async function seedDemo() {}

export async function deleteUserData(userId) {
  const m = models();
  const id = String(userId);
  await Promise.all(Object.values(m).map((M) => M.deleteMany({ userId: id })));
}

export function appRoutes({ ai, requireUser, counters }) {
  const r = express.Router();
  const { Town, Mem, Convo, Rumour, Diary } = models();
  const uid = (req) => String(req.user._id);
  const aiConfigured = () => ai.status().providers.length > 0;

  /** AI budget: per town per day (kept on the town) and across all towns (shared counter). */
  const today = () => dayKey();
  const aiLeftOf = (t) => (aiConfigured() ? AI_PER_TOWN_DAY - (t.aiDay === today() ? t.aiUsed || 0 : 0) : 0);
  const takeBudget = async (t) => {
    if (aiLeftOf(t) <= 0) return false;
    if ((await counters.hit(`townai:all:${today()}`, 86400000)) > AI_ALL_TOWNS_DAY) return false;
    if (t.aiDay !== today()) { t.aiDay = today(); t.aiUsed = 0; }
    t.aiUsed = (t.aiUsed || 0) + 1;
    return true;
  };

  const getTown = async (userId) => {
    const t = await Town.findOne({ userId });
    if (t) return t;
    try { return await Town.create(freshTown(userId)); } catch { return Town.findOne({ userId }); }
  };
  const view = async (t) => {
    const [convos, rumours] = await Promise.all([Convo.find({ userId: t.userId }).sort({ at: -1 }).limit(6).lean(), Rumour.countDocuments({ userId: t.userId })]);
    return stateView(t, convos.reverse(), rumours, aiLeftOf(t));
  };
  const memoriesOf = (userId, id, limit = 40) => Mem.find({ userId, resident: id }).sort({ at: -1 }).limit(limit).lean();
  const remember = (userId, resident, text, importance, at, kind = 'observation') => Mem.create({ userId, resident, text, importance, at, kind });

  r.get('/town', requireUser, route(async (req, res) => {
    res.json(await view(await getTown(uid(req))));
  }));

  r.post('/tick', requireUser, route(async (req, res) => {
    const userId = uid(req);
    await getTown(userId);
    const now = nowFn();
    // Lease: only one tick per town at a time (two open tabs, or a slow AI call).
    const t = await Town.findOneAndUpdate({ userId, leaseUntil: { $lt: new Date(now) } }, { leaseUntil: new Date(now + 9000) }, { returnDocument: 'after' });
    if (!t) return res.json({ ...(await view(await Town.findOne({ userId }))), busy: true });
    const town = t.toObject();
    let budget = AI_PER_TICK;
    const useAi = async () => budget > 0 && (await takeBudget(town)) && (budget -= 1, true);
    const events = [];
    try {
      const { newDay } = advance(town, now);
      if (newDay) events.push({ at: absMin(town), text: `Day ${town.day} begins. Roosters, pressure cookers, the first chai.` });
      const nowAbs = absMin(town);

      // 1. Plans for today (4 residents per AI call, mornings only; otherwise their usual routine).
      const unplanned = town.residents.filter((x) => x.planDay !== town.day).map((x) => x.id);
      if (unplanned.length && town.minute < 11 * 60 && await useAi()) {
        const ids = unplanned.slice(0, 4);
        const mems = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, retrieve(await memoriesOf(userId, id), 'today plan news', nowAbs, 4)])));
        try {
          const out = await ai.json(planSchema, { label: 'plan', system: SYSTEM, prompt: planPrompt(ids, town.day, mems), maxTokens: 1400, temperature: 0.7 });
          for (const p of out.plans) {
            const res = town.residents.find((x) => x.id === p.id && ids.includes(x.id));
            const plan = toPlan(p.steps);
            if (res && plan.length >= 3) { res.plan = plan; res.planDay = town.day; }
          }
          events.push({ at: nowAbs, text: `${ids.map((id) => RESIDENT[id].short).join(', ')} planned their day.` });
        } catch (e) { log('warn', { msg: 'plan failed', detail: String(e?.message || e).slice(0, 120) }); }
        for (const id of ids) { const x = town.residents.find((y) => y.id === id); if (x.planDay !== town.day) x.planDay = town.day; } // fall back to routine today
      }

      // Diaries are once a day: keep this tick's AI budget for them.
      const diaryDue = town.minute >= 21 * 60 + 45 && town.diaryDay < town.day;

      // 2. Walking.
      events.push(...moves(town, nowAbs));

      // 3. A conversation.
      const pair = nowAbs - town.lastConvoAt >= CONVO_GAP_MIN ? pickPair(town, nowAbs) : null;
      if (pair) {
        const { a, b } = pair;
        const [memA, memB, rumours] = await Promise.all([memoriesOf(userId, a.id), memoriesOf(userId, b.id), Rumour.find({ userId, knowers: { $in: [a.id, b.id] } }).lean()]);
        const newsA = rumours.filter((x) => x.knowers.includes(a.id) && !x.knowers.includes(b.id)).map((x) => ({ id: String(x._id), text: x.text }));
        const newsB = rumours.filter((x) => x.knowers.includes(b.id) && !x.knowers.includes(a.id)).map((x) => ({ id: String(x._id), text: x.text }));
        let out = null;
        let usedAi = false;
        if (!diaryDue && await useAi()) {
          try {
            out = await ai.json(convoSchema, { label: 'convo', system: SYSTEM, prompt: convoPrompt({ a: a.id, b: b.id, place: a.loc, minute: town.minute, memA: retrieve(memA, RESIDENT[b.id].name, nowAbs), memB: retrieve(memB, RESIDENT[a.id].name, nowAbs), newsA, newsB }), maxTokens: 700, temperature: 0.9 });
            usedAi = true;
          } catch (e) { log('warn', { msg: 'convo failed', detail: String(e?.message || e).slice(0, 120) }); }
        }
        out ??= scriptedConvo(a.id, b.id, newsA, Math.floor(nowAbs), PLACE[a.loc].name);
        const lines = out.lines.map((l) => ({ speaker: l.speaker === b.id || l.speaker.toLowerCase().startsWith(RESIDENT[b.id].short.toLowerCase()) ? b.id : a.id, text: l.text }));
        const validNews = new Map([...newsA.map((n) => [n.id, [a.id, b.id]]), ...newsB.map((n) => [n.id, [b.id, a.id]])]);
        const shared = out.shared.filter((id) => validNews.has(id));
        await Convo.create({ userId, a: a.id, b: b.id, place: a.loc, at: nowAbs, lines, ai: usedAi, shared });
        for (const id of shared) {
          const [from, to] = validNews.get(id);
          await Rumour.updateOne({ _id: id, userId }, { $addToSet: { knowers: to }, $push: { spread: { from, to, at: nowAbs } } });
          const rum = await Rumour.findById(id).lean();
          await remember(userId, to, `${RESIDENT[from].short} told me: ${rum.text}`, 7, nowAbs, 'news');
          events.push({ at: nowAbs, text: `📣 ${RESIDENT[from].short} passed the news to ${RESIDENT[to].short}.` });
        }
        if (out.memoryA) await remember(userId, a.id, out.memoryA, 4, nowAbs, 'conversation');
        if (out.memoryB) await remember(userId, b.id, out.memoryB, 4, nowAbs, 'conversation');
        const busy = nowAbs + lines.length * 1.6;
        a.busyUntil = busy; b.busyUntil = busy;
        a.unreflected = (a.unreflected || 0) + 4 + shared.length * 7; b.unreflected = (b.unreflected || 0) + 4 + shared.length * 7;
        town.pairLast = { ...town.pairLast, [pair.key]: nowAbs };
        town.lastConvoAt = nowAbs;
        events.push({ at: nowAbs, text: `💬 ${RESIDENT[a.id].short} and ${RESIDENT[b.id].short} are chatting at ${PLACE[a.loc].name}.` });
      }

      // 4. A reflection, when someone has had a lot to think about.
      const thinker = town.residents.filter((x) => (x.unreflected || 0) >= REFLECT_AT).sort((x, y) => y.unreflected - x.unreflected)[0];
      if (thinker && !diaryDue && await useAi()) {
        try {
          const out = await ai.json(reflectSchema, { label: 'reflect', system: SYSTEM, prompt: reflectPrompt(thinker.id, (await memoriesOf(userId, thinker.id, 15)).reverse()), maxTokens: 300 });
          for (const text of out.insights) await remember(userId, thinker.id, text, 7, nowAbs, 'reflection');
          events.push({ at: nowAbs, text: `💭 ${RESIDENT[thinker.id].short} is lost in thought.` });
        } catch (e) { log('warn', { msg: 'reflect failed', detail: String(e?.message || e).slice(0, 120) }); }
        thinker.unreflected = 0;
      }

      // 5. Diaries at the end of the day (one AI call for everyone, or a plain list).
      if (town.minute >= 21 * 60 + 45 && town.diaryDay < town.day) {
        const since = (town.day - 1) * 1440;
        const mems = Object.fromEntries(await Promise.all(RESIDENTS.map(async (x) => [x.id, (await Mem.find({ userId, resident: x.id, at: { $gte: since } }).sort({ at: 1 }).limit(12).lean())])));
        let diaries = null;
        if (await useAi()) {
          try { diaries = (await ai.json(diarySchema, { label: 'diary', system: SYSTEM, prompt: diaryPrompt(town.day, mems), maxTokens: 2000, temperature: 0.8 })).diaries; } catch (e) { log('warn', { msg: 'diary failed', detail: String(e?.message || e).slice(0, 120) }); }
        }
        const byId = new Map((diaries || []).map((d) => [d.id, d.text]));
        await Diary.insertMany(RESIDENTS.map((x) => ({ userId, resident: x.id, day: town.day, ai: byId.has(x.id), text: byId.get(x.id) || (mems[x.id].length ? mems[x.id].map((m) => m.text).join(' ') : 'A quiet day.') })));
        town.diaryDay = town.day;
        events.push({ at: nowAbs, text: '📔 Everyone wrote in their diary.' });
      }

      pushEvents(town, events);
      town.version += 1;
      town.leaseUntil = new Date(0);
      await Town.replaceOne({ _id: t._id }, town);
      res.json(await view(town));
    } catch (e) {
      await Town.updateOne({ _id: t._id }, { leaseUntil: new Date(0) });
      throw e;
    }
  }));

  const residentParam = (req) => { const id = String(req.params.id); if (!RESIDENT[id]) throw new ApiError(404, 'No such resident.'); return id; };

  r.get('/residents/:id', requireUser, route(async (req, res) => {
    const id = residentParam(req);
    const userId = uid(req);
    const t = await getTown(userId);
    const me = t.residents.find((x) => x.id === id);
    const [mems, diaries, convos] = await Promise.all([
      memoriesOf(userId, id, 30),
      Diary.find({ userId, resident: id }).sort({ day: -1 }).limit(5).lean(),
      Convo.find({ userId, $or: [{ a: id }, { b: id }] }).sort({ at: -1 }).limit(5).lean(),
    ]);
    const def = RESIDENT[id];
    res.json({
      id, name: def.name, age: def.age, job: def.job, traits: def.traits, colour: def.colour,
      plan: (me.planDay === t.day && me.plan?.length ? me.plan : def.routine).map(([m, place, activity]) => ({ minute: m, place, activity })),
      planned: me.planDay === t.day && Boolean(me.plan?.length),
      memories: mems.map((m) => ({ text: m.text, importance: m.importance, at: m.at, kind: m.kind })),
      diaries: diaries.map((d) => ({ day: d.day, text: d.text, ai: d.ai })),
      convos: convos.map((c) => ({ a: c.a, b: c.b, at: c.at, place: c.place, lines: c.lines })),
    });
  }));

  r.post('/residents/:id/talk', requireUser, route(async (req, res) => {
    const id = residentParam(req);
    const { message } = parse(z.object({ message: z.string().trim().min(1).max(300) }), req.body);
    const userId = uid(req);
    const t = await getTown(userId);
    const nowAbs = absMin(t);
    const me = t.residents.find((x) => x.id === id);
    if (!(await takeBudget(t))) throw new ApiError(429, `${RESIDENT[id].short} is busy today: the town's daily AI budget is used up. Come back tomorrow!`);
    const mems = retrieve(await memoriesOf(userId, id), message, nowAbs);
    await Town.updateOne({ _id: t._id }, { aiDay: t.aiDay, $inc: { aiUsed: 1 } });
    const out = await ai.chat({ label: 'talk', system: SYSTEM, prompt: talkPrompt(id, mems, message, t.minute, me.walk ? me.walk.to : me.loc), maxTokens: 200, temperature: 0.8 });
    await remember(userId, id, `A visitor said to me: "${message.slice(0, 120)}"`, 5, nowAbs, 'visitor');
    res.json({ reply: out.text });
  }));

  r.post('/residents/:id/whisper', requireUser, route(async (req, res) => {
    const id = residentParam(req);
    const { news } = parse(z.object({ news: z.string().trim().min(5).max(160).transform((s) => s.replace(/https?:\/\/\S+/g, '[link]')) }), req.body);
    const userId = uid(req);
    if (await Rumour.countDocuments({ userId }) >= 30) throw new ApiError(403, 'The mohalla can only keep track of 30 pieces of news. Reset the town to start over.');
    const t = await getTown(userId);
    const nowAbs = absMin(t);
    const rum = await Rumour.create({ userId, text: news, origin: id, at: nowAbs, spread: [], knowers: [id] });
    await remember(userId, id, `A visitor whispered to me: ${news}`, 8, nowAbs, 'news');
    await Town.updateOne({ _id: t._id }, { $push: { events: { $each: [{ at: nowAbs, text: `🤫 You whispered some news to ${RESIDENT[id].short}.` }], $slice: -MAX_EVENTS } } });
    res.status(201).json({ rumour: { id: String(rum._id), text: rum.text, origin: id } });
  }));

  r.get('/rumours', requireUser, route(async (req, res) => {
    const list = await Rumour.find({ userId: uid(req) }).sort({ at: -1 }).limit(30).lean();
    res.json({ rumours: list.map((x) => ({ id: String(x._id), text: x.text, origin: x.origin, at: x.at, spread: x.spread, knowers: x.knowers })) });
  }));

  r.post('/town/reset', requireUser, route(async (req, res) => {
    const userId = uid(req);
    await deleteUserData(userId);
    res.json(await view(await getTown(userId)));
  }));

  // Quick check that the place ids the client sends are real (used by tests and the client).
  r.get('/places', (_req, res) => res.json({ places: PLACE_IDS }));

  return r;
}
