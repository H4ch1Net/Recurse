# Pack format and authoring guide

Built-in packs live in `src/data/packs/<id>.json`. Each pack is one topic: a short lesson plus a
question bank that Recurse schedules with spaced repetition. Validate with `npm run validate:packs`.

## Teaching principles

- Questions test understanding, not trivia. Prefer "what happens / which is right / why" over recall of
  names, unless the topic is vocabulary (languages, terms).
- Each question has one unambiguously correct answer. Distractors are plausible mistakes a real learner
  makes, roughly the same length as the answer, never jokes.
- Explanations teach: say why the answer is right and why the most tempting distractor is wrong.
- Every question maps to the lesson section that teaches it (`section` index).
- Lessons are short (8 to 15 minutes), concrete, and use examples. Each section ends with a check
  question that is not repeated in the question bank.
- Facts must be correct. Run code if in doubt. No placeholder or duplicated content.

## Shape

```json
{
  "id": "python-basics",
  "name": "Python Basics",
  "version": "2.0.0",
  "author": "Recurse",
  "subject": "programming",
  "level": "beginner",
  "description": "One sentence, under 120 characters.",
  "icon": "Py",
  "language": "python",
  "prereqs": [],
  "tags": ["python", "syntax"],
  "lesson": {
    "estimatedMinutes": 10,
    "intro": "Two or three sentences on what this topic is and why it matters.",
    "sections": [
      {
        "title": "Ranges stop early",
        "body": "Paragraphs separated by a blank line (\n\n). Use `backticks` for inline code.\n\nLines starting with \"- \" render as bullets.",
        "code": "for n in range(2, 10, 2):\n    print(n)",
        "tip": "Optional one-line tip.",
        "check": {
          "question": "What is the last number printed?",
          "choices": ["8", "10", "9", "2"],
          "answer": 0,
          "explanation": "range stops before the stop value, so 10 is never produced."
        }
      }
    ],
    "keyTerms": [{ "term": "range", "definition": "A lazy sequence of integers." }],
    "summary": ["Three to five one-line takeaways."],
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
| `subject` | `programming`, `cs`, `tools`, `web`, `security`, `math`, `science`, `humanities`, `languages` |
| `level` | `beginner`, `intermediate`, `advanced` |
| `icon` | 1 to 3 characters shown in the topic tile |
| `language` | default code highlighting: `python`, `javascript`, `typescript`, `sql`, `bash`, `html`, `css`, `json`, `dockerfile`, `yaml`, `plaintext`. Sections and questions may override with their own `language` |
| `prereqs` | pack ids recommended first. They are suggestions, nothing is locked |
| `lesson.sections` | 4 or 5 sections, each with a `check` (4 choices) |
| `lesson.keyTerms` | 5 to 8 terms |
| `questions` | 14 to 18, ids `<pack-id>-q01` and up |

### Question types

| Type | Use | Fields |
|---|---|---|
| `mcq` | concept and prediction questions | `choices` (4), `answer` (index) |
| `code-fill` | complete the code; `code` must contain the blank `_____` | `code`, `choices` (4), `answer` (index) |
| `debug` | find the bug in `code` | `code`, `choices` (4), `answer` (index) |
| `typed` | short exact answers the learner types: numbers, commands, words, translations | `answer` (string), optional `accept` (alternative strings). Matching ignores case, extra spaces, and a trailing period. Numbers compare numerically |
| `recall` | open flashcard: the learner answers in their head, reveals, then self-grades | `answer` (the back of the card, 1 to 3 sentences) |

Choice order is shuffled at study time, so `answer` can be any index. Spread answers across indexes anyway.
Aim for a mix that fits the subject: programming packs lean on `mcq`, `code-fill`, `debug`, `typed`;
math on `typed` and `mcq`; languages on `typed` and `recall`; humanities on `mcq`, `typed`, `recall`.

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
