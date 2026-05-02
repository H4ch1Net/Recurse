# Recurse
Learn it. Keep it.

A CS learning app that tracks your forgetting curve in real time. Uses FSRS spaced repetition, active recall, and AI-graded Feynman explanations to help knowledge stick.

## Features

- FSRS algorithm — smarter scheduling than Anki's default SM-2
- Live memory health score per topic
- 3 question types: multiple choice, code completion, debug
- Feynman mode — AI grades plain-language explanations
- 10 built-in topic packs, unlimited custom/community packs
- Achievements, XP, levels, streaks, shareable progress card
- PWA — installable and works offline
- No account needed. All data stays in your browser.

## Setup

```bash
npm install
npm run generate:data
npm run dev
```

## Generate content

```bash
npm run generate:data
```

Regenerates all pack JSON from the source curriculum scripts.

## Run tests

```bash
npm run test
```

## AI features

Feynman mode and AI pack generation require an API key. Set it in Settings (gear icon, top right).

Supported providers:
- Anthropic (Claude): console.anthropic.com — Default model: claude-haiku-4-5-20251001
- OpenAI (GPT): platform.openai.com — Default model: gpt-4o-mini
- OpenRouter (free tier): openrouter.ai — Free model: google/gemma-3-4b-it:free

## Adding topic packs

Drop a new JSON file into `src/data/packs/` following the pack schema. It appears on the dashboard automatically — no code changes needed. See `src/data/packs/python-basics.json` for a reference.

## Community packs

Import any pack via raw GitHub URL in the dashboard import modal. Submit packs to: github.com/[yourname]/recurse-packs

## Tech

React 18, Vite, ts-fsrs, Chart.js, highlight.js
No backend. No database. No account. Just localStorage.

## License

MIT
