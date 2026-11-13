import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, retrieve, moves, pickPair, toPlan, scriptedConvo, DAY_START } from '../town.js';
import { route, pointAt, PLACES } from '../../shared/town-map.js';

test('clock advances with real time, caps long pauses and skips nights', () => {
  const t = { day: 1, minute: 8 * 60, lastTickAt: new Date(0) };
  advance(t, 10_000); // 10 s later → 20 town minutes
  assert.equal(t.minute, 8 * 60 + 20);
  advance(t, 10_000 + 3_600_000); // an hour away → capped
  assert.equal(t.minute, 8 * 60 + 60);
  const late = { day: 3, minute: 22 * 60 + 29, lastTickAt: new Date(0) };
  assert.equal(advance(late, 5000).newDay, true);
  assert.deepEqual([late.day, late.minute], [4, DAY_START]);
});

test('retrieval favours recent, important and relevant memories', () => {
  const now = 2000;
  const ms = [
    { text: 'Bought sugar at the kirana', importance: 2, at: now - 10 },
    { text: 'A visitor whispered: the cricket match is cancelled', importance: 8, at: now - 300 },
    { text: 'Old story about 1983', importance: 3, at: now - 1400 },
  ];
  assert.match(retrieve(ms, 'cricket match', now, 1)[0].text, /cancelled/);
  assert.match(retrieve(ms, 'sugar', now, 1)[0].text, /sugar/);
});

test('walks follow the plan, take time, and arrive', () => {
  const town = { day: 1, minute: 9 * 60, residents: [{ id: 'raju', loc: 'home_yadav', walk: null, planDay: 0 }] };
  moves(town, 9 * 60);
  const w = town.residents[0].walk;
  assert.equal(w.to, 'chai');
  assert.ok(w.end > w.start);
  moves(town, w.end + 1);
  assert.equal(town.residents[0].loc, 'chai');
  assert.equal(town.residents[0].walk, null);
});

test('pairs: same public place, idle, not talked recently', () => {
  const town = { pairLast: {}, residents: [{ id: 'raju', loc: 'chai' }, { id: 'joseph', loc: 'chai' }, { id: 'meena', loc: 'kirana' }, { id: 'pooja', loc: 'home_sharma' }] };
  assert.equal(pickPair(town, 600).key, 'joseph|raju');
  town.pairLast['joseph|raju'] = 580;
  assert.equal(pickPair(town, 600), null);
});

test('plans drop impossible times and are sorted', () => {
  assert.deepEqual(toPlan([{ time: '18:00', place: 'park', activity: 'b' }, { time: '25:99', place: 'chai', activity: 'x' }, { time: '07:00', place: 'chai', activity: 'a' }]).map((x) => x[0]), [420, 1080]);
});

test('scripted conversations still spread news from gossip-lovers', () => {
  const c = scriptedConvo('raju', 'meena', [{ id: 'n1', text: 'The ground will get floodlights.' }], 1, 'the stall');
  assert.deepEqual(c.shared, ['n1']);
  assert.match(c.lines.at(-2).text, /floodlights/);
});

test('every route can be animated end to end', () => {
  const r = route('home_khan', 'ground');
  assert.deepEqual(pointAt(r.points, 0), r.points[0]);
  assert.deepEqual(pointAt(r.points, 1), r.points.at(-1));
  assert.equal(PLACES.length, 15);
});
