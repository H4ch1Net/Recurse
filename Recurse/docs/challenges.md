# Coding challenges

Coding problems that run in the browser against tests, in JavaScript or Python. They live in
`src/data/challenges/<set>.json`, one file per set (usually one per pattern or pack). Run
`npm run validate:challenges` to check the format and run every reference solution against its
tests (JavaScript in Node; Python too when `python3` is installed).

## File shape

```json
{
  "set": "hash-maps",
  "title": "Hash maps and sets",
  "challenges": [
    {
      "id": "two-sum",
      "title": "Two Sum",
      "difficulty": "easy",
      "pattern": "Hash map lookup",
      "topic": "swe-hash-maps",
      "tags": ["array", "hash map"],
      "prompt": "Given an array of integers `nums` and an integer `target`, return the indexes of the two numbers that add up to `target`.\n\nEach input has exactly one solution, and you may not use the same element twice. Return the smaller index first.",
      "examples": [
        { "input": "nums = [2, 7, 11, 15], target = 9", "output": "[0, 1]", "explain": "2 + 7 = 9" }
      ],
      "constraints": ["2 <= nums.length <= 10^4", "Exactly one valid answer exists"],
      "function": { "javascript": "twoSum", "python": "two_sum" },
      "params": ["nums", "target"],
      "starter": {
        "javascript": "function twoSum(nums, target) {\n  // your code here\n}\n",
        "python": "def two_sum(nums, target):\n    # your code here\n    pass\n"
      },
      "tests": [
        { "args": [[2, 7, 11, 15], 9], "expected": [0, 1] },
        { "args": [[3, 2, 4], 6], "expected": [1, 2] },
        { "args": [[3, 3], 6], "expected": [0, 1], "hidden": true }
      ],
      "compare": "exact",
      "hints": ["What do you need to have seen before to finish at index i?", "Store each value's index in a map as you go."],
      "solution": {
        "javascript": "function twoSum(nums, target) {\n  const seen = new Map()\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i]\n    if (seen.has(need)) return [seen.get(need), i]\n    seen.set(nums[i], i)\n  }\n  return []\n}\n",
        "python": "def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return []\n"
      },
      "explanation": "One pass with a map from value to index. For each number, check whether its complement was already seen.",
      "complexity": { "time": "O(n)", "space": "O(n)" }
    }
  ]
}
```

| Field | Rules |
|---|---|
| `id` | unique across all sets, kebab-case |
| `difficulty` | `easy`, `medium`, `hard` |
| `topic` | id of the pack this practices; the topic page lists its challenges |
| `prompt` | the problem in your own words (do not copy text from other sites). Same inline markup as lessons |
| `function`, `params` | the function the learner writes, per language |
| `tests` | 4 to 12 cases. `args` is the argument list, `expected` the return value, both JSON. Mark some `hidden: true`; the first two or three stay visible. Cover edge cases (empty input, one element, duplicates, negatives) |
| `compare` | `exact` (deep equality, default), `unordered` (array order ignored), `unordered-deep` (order ignored at the outer and inner levels, for lists of groups), `float` (numbers within 1e-6) |
| `argTypes` | optional, per parameter: `"list"` (array becomes a singly linked `ListNode` chain) or `"tree"` (level-order array with `null` gaps becomes a `TreeNode`). `returnType` may also be `"list"` or `"tree"`; results are converted back to arrays before comparing |
| `hints` | 2 or 3, from a nudge to nearly the answer |
| `solution` | reference solutions in both languages; they must pass every test |
| `explanation`, `complexity` | the approach, and its time and space complexity |

`ListNode` has `val` and `next`; `TreeNode` has `val`, `left` and `right`, in both languages. They
are provided by the runner, so learners can use them without defining them.

Learner code runs in a Web Worker with a time limit, so an infinite loop cannot freeze the page.
Python runs on Pyodide, which the browser downloads once (about 10 MB) the first time a Python
challenge runs.

## Optional fields

These are all optional; existing sets need no changes.

| Field | Rules |
|---|---|
| set `description` | one sentence about the set, for lists of sets |
| set `order` | number; lower sorts first (default 100). `warmups` uses 0 so beginners see it first |
| `argTypes` | an array aligned with `params` (use `null` for plain values, as in `["list", null]`) or an object keyed by parameter name (`{ "root": "tree" }`). Besides `"list"` and `"tree"`, `"list[]"` and `"tree[]"` convert an array of arrays into an array of lists or trees (for example, merging k sorted lists). `returnType` accepts the same four values |
| `timeLimit` | milliseconds per test, 500 to 20000 (default 3000). Raise it only when a correct Python solution needs longer on a big test |

## How the runner treats learner code

- Tests run one at a time, each with fresh copies of its arguments, and each test gets its own
  time limit. Results report pass or fail, the returned value, anything printed, errors with line
  numbers in the learner's code, and the time taken.
- JavaScript: the function is looked up by name, so `function twoSum`, `const twoSum = (...) =>`
  and `var twoSum = function` all work. A function may return a promise; it is awaited.
- Python: the module runs once, then the function is called per test. A LeetCode style
  `class Solution` with a method named like the function (or its camelCase form) also works.
  `List`, `Optional` and the other `typing` names are available for type hints; anything else
  from the standard library needs an import. `input()` is not available.
- Results go through JSON before comparing: Python tuples and sets become lists, `None` is `null`.
  A JavaScript function that returns `undefined` fails (expected values never contain it), and
  the learner is told they probably forgot a `return`.
- Hidden tests show only pass or fail until the learner passes them.
- Drafts are saved per challenge and language in `localStorage` under
  `recurse_code_<id>_<language>`.
