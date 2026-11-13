# Mohalla

**Live website:** https://mohalla-jateen.netlify.app · [![CI](https://github.com/jateenyadav/mohalla/actions/workflows/ci.yml/badge.svg)](https://github.com/jateenyadav/mohalla/actions/workflows/ci.yml)

A tiny Indian neighbourhood where AI residents live, talk and gossip.

Eight residents (a chai-wala, a kirana owner, a cricket-mad schoolboy, the local doctor, an auto driver, a
maths teacher, a retired uncle with stories about 1983, and a young boutique owner) wake up, plan their day,
walk to work, chat, reflect and write a diary every night. You can:
- **watch**
- **talk to anyone**
- **whisper some news** to one person, then follow it on the **news tracker** as it passes from person to
  person

A full town day takes about 8 minutes. Click **Try the demo**.

<!-- demo video: docs/demo.mp4 -->

## How the residents think (generative agents, kept small)
- **Memory stream**: every conversation, visitor chat and piece of news is a memory with an importance
  score.
- **Retrieval** = recency (decays per town hour) + importance + relevance to the current situation. This is
  the scoring from the *Generative Agents* paper.
- **Plans**: each morning the AI plans the day for 4 residents per call, using their recent memories, so
  someone who heard big news may go to check it out. Without AI, each resident follows their usual
  routine.
- **Conversations**: two idle people in the same public place who haven't talked lately get a short AI
  dialogue. News is passed on only if the AI says it was shared, and only news the speaker actually knew
  counts.
- **Reflections**: after enough important memories, a resident draws 1–3 higher-level thoughts.
- **Diaries**: one AI call writes everyone's diary at night. It takes priority over chat in that tick.

## Runs on free tiers: no always-on server
- **The town only runs while you watch.** The browser calls `POST /api/tick` every 6 s, and each tick moves
  town time forward by the real time elapsed (1 s = 2 town minutes; long pauses are capped and nights are
  skipped).
- **A MongoDB lease** (`leaseUntil`) lets only one tick run at a time, even with two tabs open.
- **At most 2 AI calls per tick**, with a daily AI budget per town (and one across all towns). When it runs
  out, residents switch to scripted routines and scripted small talk, so the lane stays alive and news
  still spreads.
- **Walks are sent as timed routes** (A* on the road grid, shared by server and browser). The browser
  animates them smoothly between ticks, so motion doesn't depend on how often ticks arrive.
- **Each visitor gets a private town**, so nobody sees a stranger's whispers.

```
Browser (canvas map, 60 fps)            Netlify Function                                   MongoDB Atlas
──────────────────────────               ────────────────                                   ─────────────
every 6 s ──POST /tick──────────────▶ lease → advance clock → plans (≤4/call) → walks (A*) ─▶ Town (lease, clock, residents)
                                      → one conversation (AI or scripted) → news spread ───▶ Convo, Rumour, TownMemory
                                      → reflection / nightly diaries (≤2 AI calls per tick) ─▶ Diary
talk / whisper ──POST /residents/:id/…──▶ memory + reply
```

## Measured results
[`scripts/eval.mjs`](scripts/eval.mjs) runs one full town day with the real free AI and reports:
- tick time (median / p90 / max, which must stay under Netlify's ~10 s)
- AI calls used
- conversations, plans, reflections and diaries
- how many residents knew a whispered piece of news by night, and the path it took

Results go in `docs/eval-results.md`. *(Not run yet: this needs a real Groq key. No numbers are shown until
there is a real run.)*

## Key decisions
- **Canvas 2D instead of a game engine, with original flat art** (no tile packs): a small bundle, and the
  same drawing works on phones.
- **Short names and fixed personas**, so the model stays in character, plus a system prompt that keeps it
  warm and never cruel. Visitor text is treated as data.

## Run locally
```bash
npm install
npm run dev        # API on :8888 + web on :5173. No keys needed: in-memory DB + fake AI
npm test           # 18 engine + API tests (news spreading, a full day, no-AI mode, lease)
npm run test:e2e   # Playwright: talk → whisper → news spreads (desktop + phone)
node scripts/eval.mjs   # one measured town day (needs GROQ_API_KEY)
```

## Credits
Inspired by [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town) and *Generative Agents:
Interactive Simulacra of Human Behavior* (Park et al., 2023). This is an independent implementation. The
map, characters and story are original and made up.

## License
MIT
