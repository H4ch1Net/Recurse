# Interactive activities

Activities are small interactive widgets embedded in lessons (`section.activity`) and listed on
the Practice page as sandboxes. The list of types, with their props, is `src/activities/catalog.js`.
That file is the source of truth: the pack validator rejects unknown types.

## Using an activity in a pack

```json
"activity": {
  "type": "stp-election",
  "title": "Who becomes root?",
  "prompt": "Lower SW3's priority to 4096 and predict the new root ports before you apply it.",
  "goal": "Optional: replaces the default goal from the catalog",
  "props": {}
}
```

All fields except `type` are optional. Write a `prompt` that tells the learner what to try and what
to notice; that is what turns a toy into a lesson.

## Writing a widget

Each type is one file, `src/activities/widgets/<type>.jsx`, with a default export:

```jsx
export default function MyWidget({ props, onComplete, standalone }) { ... }
```

- `props`: the object from the pack (possibly `{}`). Every prop is optional; validate and default.
- `onComplete(result)`: call when the learner reaches the goal. `result` is optional
  (`{ score: 0..1, detail: 'text' }`). Calling it more than once is harmless.
- `standalone`: true on the Practice page, where the widget is the whole activity. Widgets may show
  extra controls (randomize, difficulty) when standalone.

The frame around the widget (title, prompt, goal, Reset, "Done" stamp, celebration) is drawn by
`src/activities/Activity.jsx`. Reset remounts the widget, so keep all state inside it.

### Rules

- Plain React 19 with hooks, JSX, no new npm dependencies. Icons from `lucide-react`.
- Styles go in `src/activities/widgets/<type>.css`, imported by the widget. Prefix every class with
  the type (for example `.stp-...`) so widgets never collide. Use the design tokens (`--card`,
  `--card-2`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--rule-strong`, `--accent`,
  `--accent-soft`, `--accent-text`, `--on-accent`, `--good`, `--good-soft`, `--bad`, `--bad-soft`,
  `--warn`, `--warn-soft`, `--font-mono`, `--font-display`, spacing `--s-1` to `--s-9`, radii
  `--r-sm` to `--r-lg`, motion `--t-fast`, `--t-base`, `--t-slow`, `--ease`), never hard-coded
  colors except inside SVG data visualizations where a token cannot reach. Every theme (light,
  dark and the colored themes) must stay readable.
- Reuse the shared primitives in `src/styles/activities.css`: `.w-toolbar`, `.w-stage`
  (`.grid-bg`), `.w-readout` with `.w-stat`, `.w-tasks` with `.w-task` (`.done`, `.w-task-mark`,
  `.w-task-hint`), `.w-feedback` (`.good`, `.bad`), `.w-pill-group`, `.w-slider`, `.w-legend`, and
  the console look: `.terminal`, `.terminal-bar`, `.terminal-screen`, `.terminal-line`,
  `.terminal-prompt`, `.terminal-out`, `.terminal-err`, `.terminal-ok`, `.terminal-dim`,
  `.terminal-input-row`, `.terminal-input`. App-wide classes are available too: `.btn`
  (`.btn-primary`, `.btn-ghost`, `.btn-sm`), `.chip` (`.outline`, `.accent`, `.good`, `.warn`),
  `.input`, `.select`, `.row`, `.stack`, `.small`, `.xsmall`, `.subtle`, `.muted`, `.mono`,
  `.tabular`, `.callout` (`.good`, `.bad`, `.warn`, `.info`).
- Make it feel good. Use `src/lib/juice.js` and `src/lib/sfx.js`:
  - `feedbackCorrect(el, { combo })` and `feedbackWrong(el)` for right and wrong answers,
  - `feedbackSuccess(el, label)` for a finished sub-task,
  - `sfx.tap()`, `sfx.pop()`, `sfx.flip()`, `sfx.key()`, `sfx.tick()`, `sfx.error()` for small actions,
  - `burstFrom(el, { kind: 'sparks' | 'stars' | 'confetti' })` and `floatText(el, '+1')`.
  All of them respect the learner's sound and effects settings and reduced motion.
- Animate with CSS transitions and the Web Animations API, 120 to 600 ms, eased. Step-through
  visualizations need Play/Pause, Step and a speed control. Respect
  `@media (prefers-reduced-motion: reduce)` by shortening or removing motion.
- Accessible: real buttons, labels, `aria-live="polite"` for result text, keyboard usable,
  touch targets about 36px or more, nothing that depends on color alone.
- Responsive down to a 360px wide phone. Use SVG with a `viewBox` for diagrams so they scale.
- Teach while playing: short captions explaining each step ("Comparing 7 and 3: 3 is smaller, swap").
- Pure logic (simulators, generators, graders) goes in `src/activities/lib/<type>.js` with Vitest
  tests in `src/activities/lib/<type>.test.js`. Keep the widget file about rendering.
- No text in em dashes. Plain, friendly sentences.

See `src/activities/widgets/binary-bits.jsx` for a complete small example.
