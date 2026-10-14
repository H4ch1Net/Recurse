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
