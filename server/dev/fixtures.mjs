// Canned answers for the fake AI (local dev + tests). Functions get the request body.
const user = (body) => body.messages.find((m) => m.role === 'user')?.content || '';
const IDS = ['raju', 'meena', 'arjun', 'farida', 'bablu', 'lakshmi', 'joseph', 'pooja'];

export default {
  'Plan today for each resident': (body) => ({
    plans: IDS.filter((id) => user(body).includes(`\n${id}: `)).map((id) => ({
      id,
      steps: [
        { time: '06:30', place: id === 'raju' ? 'chai' : 'park', activity: 'morning start' },
        { time: '09:00', place: 'chai', activity: 'chai and news' },
        { time: '12:00', place: 'kirana', activity: 'shopping' },
        { time: '25:99', place: 'school', activity: 'bad time is dropped' },
        { time: '18:00', place: 'park', activity: 'evening walk' },
      ],
    })),
  }),
  ' meet at ': (body) => {
    const p = user(body);
    const [, a, b] = p.match(/"speaker": "(\w+)" or "(\w+)"/) || [];
    const news = [...p.matchAll(/\[([0-9a-f]{24})\]/g)].map((m) => m[1]);
    return {
      lines: [{ speaker: a, text: 'Arre, good morning!' }, { speaker: b, text: 'Morning! Any news?' }, { speaker: a, text: news.length ? 'Yes, big news...' : 'Nothing much.' }, { speaker: b, text: 'Tell me everything.' }],
      memoryA: `Had chai with ${b}.`,
      memoryB: `Had chai with ${a}.`,
      shared: [...news, 'not-a-real-id'],
    };
  },
  'higher-level thoughts': { insights: ['Everyone here seems to talk about the same news.'] },
  'diary entry': (body) => ({ diaries: IDS.map((id) => ({ id, text: `Dear diary, today was a busy day for ${id}.` })) }),
  'A visitor to the neighbourhood says': 'Arre, welcome! Have some chai first, then we talk.',
};
