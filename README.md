# Recurse

**Learn it. Keep it.**

Recurse is a CS flashcard app built around the science of forgetting. It uses FSRS spaced repetition to schedule reviews at the exact moment your memory starts to fade, so you stop re-learning the same things over and over.

No account required. All progress lives in your browser.

---

## What it does

- **Spaced repetition with FSRS** — smarter scheduling than the standard SM-2 algorithm used by Anki. Cards adapt to your actual forgetting curve.
- **Live memory health score** — each topic shows a real-time retrievability percentage, so you can see what is slipping before it's gone.
- **Three question types** — multiple choice, code completion, and debug (find the bug in a snippet).
- **Feynman mode** — write a plain-language explanation of a concept and get AI feedback on what you understood, what you missed, and what you got wrong.
- **10 built-in topic packs** — Python, variables and types, loops and functions, OOP, data structures, algorithms, Git, Linux CLI, networking, and cybersecurity.
- **Community packs** — import any pack via raw GitHub URL. No app update needed.
- **XP, levels, streaks, achievements** — optional gamification that actually tracks useful things (lapses, relearning count, Feynman attempts).
- **Progress share card** — generates a downloadable image of your top topics and stats.
- **PWA** — installs to your home screen and works offline.

---

## Getting started

```bash
npm install
npm run generate:data
npm run dev
```

The `generate:data` step builds the pack JSON from source. You only need to run it once on a fresh clone, or after adding new pack content.

---

## AI features

Feynman mode and AI pack generation require an API key. Set it in **Settings** (gear icon, top right).

| Provider | Model |
|---|---|
| Anthropic (Claude) | claude-haiku-4-5-20251001 |
| OpenAI (GPT) | gpt-4o-mini |
| OpenRouter (free tier) | google/gemma-3-4b-it:free |

---

## Adding topic packs

Drop a JSON file into `src/data/packs/` following the pack schema. It appears on the dashboard automatically with no code changes. See `src/data/packs/python-basics.json` for a reference.

To import a community pack, use the **Import pack** button on the dashboard and paste a raw GitHub URL.

---

## Running tests

```bash
npm run test
```

---

## Tech

- React 18
- Vite
- ts-fsrs (FSRS scheduling)
- Chart.js
- highlight.js
- No backend, no database, no account. Just localStorage.

---

## License

MIT
