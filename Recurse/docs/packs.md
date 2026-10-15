# Pack format and authoring guide

Built-in packs live in `src/data/packs/<id>.json`. Each pack is one topic: a lesson plus a
question bank that Recurse schedules with spaced repetition. Validate with `npm run validate:packs`.

Packs are grouped into **paths** (collections such as CCNA or the SWE internship path) in
`src/data/collections/`. A pack does not need to know which paths use it.

## Teaching principles

Recurse is built on what learning research supports: retrieval practice, spacing, interleaving,
worked examples, concrete examples, dual coding (words plus visuals) and self-explanation. Write
for that.

- **Teach for transfer, not trivia.** Someone who finishes the CCNA packs should pass the CCNA.
  Someone who finishes the SWE path should handle an internship interview and a first task at work.
  Write the explanation a great senior colleague would give: why it works, when to use it, what
  goes wrong, how it shows up in an exam, an interview or on the job.
- **Concrete first.** Open a section with a situation or an example, then name the idea.
- **Show, then let them do.** Use code, command output, ASCII diagrams and tables. Embed an
  interactive activity wherever one exists for the idea (see `docs/activities.md`).
- **Name the traps.** `pitfall` holds the most common mistake for a section.
- Questions test understanding: "what happens / which is right / why / what would you type". Use
  recall of names only when the name is the thing being learned (ports, commands, vocabulary).
- Each question has one unambiguously correct answer. Distractors are plausible mistakes a real
  learner makes, about the same length as the answer, never jokes.
- Explanations teach: say why the answer is right and why the most tempting distractor is wrong.
- Facts must be correct. Run code if in doubt. No placeholder or duplicated content.
- Style: plain, direct sentences. No em dashes (use commas, colons or parentheses). American spelling.

## Shape

```json
{
  "id": "python-basics",
  "name": "Python Basics",
  "version": "3.0.0",
  "author": "Recurse",
  "subject": "programming",
  "level": "beginner",
  "description": "One sentence, under 140 characters.",
  "icon": "Py",
  "language": "python",
  "prereqs": [],
  "tags": ["python", "syntax"],
  "lesson": {
    "estimatedMinutes": 18,
    "intro": "Two or three sentences on what this topic is and why it matters.",
    "objectives": ["Predict what a for loop over range() prints", "Choose between a list and a dict"],
    "sections": [
      {
        "title": "Ranges stop early",
        "body": "Paragraphs separated by a blank line. Use `backticks` for inline code and **bold** for key terms.\n\n- Lines starting with \"- \" render as bullets.",
        "code": "for n in range(2, 10, 2):\n    print(n)",
        "language": "python",
        "tip": "Optional one-line tip.",
        "pitfall": "Optional: the most common mistake here, and how to avoid it.",
        "activity": {
          "type": "code-runner",
          "title": "Try it",
          "prompt": "Change the step to 3 and predict the output before you run it.",
          "props": { "language": "python", "code": "for n in range(2, 10, 2):\n    print(n)" }
        },
        "check": {
          "question": "What is the last number printed?",
          "choices": ["8", "10", "9", "2"],
          "answer": 0,
          "explanation": "range stops before the stop value, so 10 is never produced."
        }
      }
    ],
    "keyTerms": [{ "term": "range", "definition": "A lazy sequence of integers." }],
    "summary": ["Three to six one-line takeaways."],
    "feynmanPrompt": "Explain ... to a friend who has never programmed."
  },
  "questions": [
    {
      "id": "python-basics-q01",
      "type": "mcq",
      "difficulty": "easy",
      "question": "What does list(range(2, 10, 2)) return?",
      "choices": ["[2, 4, 6, 8]", "[2, 4, 6, 8, 10]", "[1, 3, 5, 7, 9]", "[2, 6, 10]"],
      "answer": 0,
      "explanation": "range excludes the stop value, so 10 is not included.",
      "concept": "range stop value",
      "section": 0
    }
  ]
}
```

| Field | Rules |
|---|---|
| `subject` | `programming`, `cs`, `swe`, `tools`, `web`, `networking`, `security`, `math`, `science`, `humanities`, `languages` |
| `level` | `beginner`, `intermediate`, `advanced` |
| `icon` | 1 to 3 characters shown in the topic tile |
| `language` | default code highlighting: `python`, `javascript`, `typescript`, `java`, `cpp`, `go`, `sql`, `bash`, `html`, `css`, `json`, `dockerfile`, `yaml`, `cisco` (IOS config and show output), `plaintext`. Sections and questions may override with their own `language` |
| `prereqs` | pack ids recommended first. Suggestions only, nothing is locked |
| `lesson.objectives` | 2 to 5 "you will be able to" statements, each starting with a verb |
| `lesson.sections` | 4 to 10 sections, each with a `check` (4 choices). Optional `code`, `tip`, `pitfall`, `activity` |
| `lesson.keyTerms` | 5 to 15 terms. They also feed the app-wide glossary, so define each one so it stands on its own |
| `questions` | 12 or more for built-in packs (aim for 30 to 45), ids `<pack-id>-q01` and up |
| `resources` | optional, up to 8 outside links shown under "Go deeper" on the topic page and collected on its paths: `{ "title", "url" (https), "kind": docs, book, course, video, practice, tool or article, "note" }`. Free resources first, and check every link opens |

`estimatedMinutes` should be honest: about 200 words a minute plus time for activities and checks.

### Question types

| Type | Use | Fields |
|---|---|---|
| `mcq` | concept and prediction questions | `choices` (4), `answer` (index) |
| `code-fill` | complete the code; `code` must contain the blank `_____` | `code`, `choices` (4), `answer` (index) |
| `debug` | find the bug in `code` | `code`, `choices` (4), `answer` (index) |
| `typed` | short exact answers: numbers, words, outputs, translations | `answer` (string), optional `accept` (alternatives). Matching ignores case, extra spaces and a trailing period. Numbers compare numerically |
| `cli` | type a command | `answer` (full command), optional `accept`, optional `shell`: `ios`, `bash`, `git`, `sql`, `docker`. For `ios`, abbreviations are accepted automatically (`sh ip int br` matches `show ip interface brief`); arguments such as numbers, addresses and names must match exactly |
| `recall` | open flashcard: answer in your head, reveal, self-grade | `answer` (the back of the card, 1 to 3 sentences) |
| `multi` | select all that apply | `choices` (3 to 6), `answers` (array of correct indexes, at least one choice must be wrong). Correct only when the exact set is chosen |
| `order` | put steps in order | `items` (3 to 8 strings, written in the correct order; shuffled at study time) |
| `match` | match pairs | `pairs`: 3 to 6 `{ "left": "...", "right": "..." }` |

Every question also has `difficulty` (`easy`, `medium`, `hard`), `explanation`, `concept` (2 to 5
words) and `section` (index of the lesson section that teaches it). Questions may carry `code` and
`language` for any type.

Choice order is shuffled at study time, so `answer` can be any index. Spread answers across indexes
anyway. Mix types to fit the subject: programming leans on `mcq`, `code-fill`, `debug`, `typed`;
networking on `mcq`, `cli`, `multi`, `order`, `match`; math on `typed` and `mcq`; languages on
`typed`, `match` and `recall`. Every built-in pack uses at least two types; good packs use four or more.

### Activities

A section may embed one interactive activity:

```json
"activity": { "type": "subnet-drill", "title": "Drill it", "prompt": "What to do and why.", "goal": "Optional goal override", "props": { "difficulty": "medium" } }
```

`type` must be one of the types in `src/activities/catalog.js` (listed with their props in
`docs/activities.md`). `title`, `prompt`, `goal` and `props` are optional. Learners who finish an
activity's goal get credit for it on the topic page.

### Code challenges and console labs

Coding problems live in `src/data/challenges/*.json` and Cisco console labs in
`src/activities/lib/ios/labs.js`. Both name the pack they practice (`topic`), so the topic page
lists them automatically. Embed one in a lesson with the `challenge` or `ios-console` activity.

## Your own packs

Packs you create in the app, import from a file or URL, or generate with AI use the same format with
looser rules: only `id`, `name` and `questions` are required, a lesson is optional, and question ids
can be anything unique. The smallest useful pack:

```json
{
  "id": "spanish-food",
  "name": "Spanish: food words",
  "subject": "languages",
  "questions": [
    { "id": "f1", "type": "typed", "question": "la manzana", "answer": "the apple", "accept": ["apple"] },
    { "id": "f2", "type": "recall", "question": "How do you ask for the bill?", "answer": "La cuenta, por favor." }
  ]
}
```

To share a pack, export it from its topic page (Manage > Export), commit the JSON to any public
repository, and send people the raw file URL. They add it with Library > Import > From URL.

Imported text is length-limited and stripped of markup. Pack ids that collide with a built-in pack
get a `-custom` suffix.
