import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dataDir = join(root, 'src', 'data')
const packsDir = join(dataDir, 'packs')
mkdirSync(packsDir, { recursive: true })

const topicSpecs = [
  {
    id: 'python-basics',
    name: 'Python Basics',
    category: 'language',
    icon: 'py',
    color: '#00e38c',
    prereqs: [],
    estimatedHours: 2.5,
    brief: 'Core syntax, data types, and control flow.',
    lesson: {
      estimatedMinutes: 28,
      sections: [
        {
          title: 'Start with the execution model',
          body: 'Python reads top to bottom, but the important part is understanding what each line changes. Variables hold references, functions package behavior, and control flow decides what runs next.',
          code: 'count = 3\ncount += 1\nprint(count)',
          tip: 'Trace the value after each line, not just the final output.'
        },
        {
          title: 'Strings, slicing, and f-strings',
          body: 'Strings are sequences. That means slicing works the same way as with lists, and f-strings are the cleanest way to format values when you already know the variables you want to print.',
          code: 'name = "Ada"\nprint(name[1:])\nprint(f"Hello, {name}!")',
          tip: 'Remember: slicing excludes the end index.'
        },
        {
          title: 'Input and output',
          body: 'input() always returns text. If you need numbers, cast explicitly. print() is for displaying output; return is for sending a value back to the caller.',
          code: 'age = int(input("Age? "))\nprint(age + 1)',
          tip: 'Most beginner bugs come from forgetting the type conversion.'
        },
        {
          title: 'Ranges and loops',
          body: 'range(start, stop, step) stops before stop. That off-by-one detail matters everywhere you loop, slice, or index arrays.',
          code: 'for number in range(2, 10, 2):\n    print(number)',
          tip: 'If you can predict the exact output, you understand the loop.'
        }
      ],
      keyTerms: [
        { term: 'variable', definition: 'A name that points at a value.' },
        { term: 'string', definition: 'Text data like "hello".' },
        { term: 'slice', definition: 'A way to take part of a sequence.' },
        { term: 'function', definition: 'A reusable block of code that does one job.' },
        { term: 'range', definition: 'A sequence of numbers used in loops.' }
      ],
      feynmanPrompt: 'Explain why Python uses indentation and why input() often needs int() before you do math.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'What does list(range(2, 10, 2)) return?',
        code: 'values = list(range(2, 10, 2))',
        choices: ['[2, 4, 6, 8]', '[2, 4, 6, 8, 10]', '[1, 3, 5, 7, 9]', '[2, 6, 10]'],
        answer: 0,
        explanation: 'range stops before the stop value, so 10 is excluded.',
        concept: 'range step and stop values'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Complete the slicing code so it removes the last character.',
        code: 'word = "recurse"\nprint(word[_____])',
        choices: [':-1', ':1', '[1:]', '[:-2]'],
        answer: 0,
        explanation: 'word[:-1] returns everything except the last character.',
        concept: 'slice endpoints'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What is wrong with this code?',
        code: 'age = input("Age? ")\nprint(age + 1)',
        choices: [
          'input() returns a string, so age must be converted before math',
          'The print function cannot show numbers',
          'The code needs a return statement',
          'The variable name age is reserved'
        ],
        answer: 0,
        explanation: 'input() gives you text, so age + 1 tries to mix a string and an int.',
        concept: 'input() returns text'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'Which f-string is correct for printing price with two decimals?',
        code: 'price = 3.5',
        choices: ['f"{price:2f}"', 'f"{price:.2f}"', 'f"{price,2f}"', 'f"price:.2f"'],
        answer: 1,
        explanation: ':.2f formats the number with two digits after the decimal point.',
        concept: 'formatted string literals'
      }
    ]
  },
  {
    id: 'variables-types',
    name: 'Variables & Types',
    category: 'language',
    icon: 'vt',
    color: '#388bfd',
    prereqs: [],
    estimatedHours: 2.5,
    brief: 'Mutability, casting, and Python object basics.',
    lesson: {
      estimatedMinutes: 30,
      sections: [
        {
          title: 'Values have types',
          body: 'In Python, every value has a type. Some types are immutable, like int and str. Others, like list, can change in place.',
          code: 'x = 3\nname = "Ada"\nitems = [1, 2, 3]',
          tip: 'Type tells you what operations make sense.'
        },
        {
          title: 'Casting is explicit',
          body: 'Python will not guess when you are mixing text and numbers. Convert with int(), float(), str(), or bool() when you mean to change the representation.',
          code: 'count = int("4")\nratio = float("3.5")',
          tip: 'Casting is usually the fix for beginner type errors.'
        },
        {
          title: 'Mutability matters',
          body: 'Lists and dictionaries can change after you pass them into a function. That is powerful, but it is also how hidden bugs show up when several parts of code share the same object.',
          code: 'items = [1, 2]\nitems.append(3)\nprint(items)',
          tip: 'Ask whether the object itself changes or just a name points elsewhere.'
        },
        {
          title: 'None and truthiness',
          body: 'None means "no value". It is not the same as 0 or an empty string, but all three are falsy in conditionals. That detail shows up constantly in real code.',
          code: 'result = None\nif result is None:\n    print("missing")',
          tip: 'Use is None, not == None.'
        }
      ],
      keyTerms: [
        { term: 'immutable', definition: 'Cannot be changed in place after creation.' },
        { term: 'mutable', definition: 'Can be changed in place.' },
        { term: 'casting', definition: 'Converting a value from one type to another.' },
        { term: 'truthy', definition: 'A value treated as true in an if statement.' },
        { term: 'None', definition: 'Python’s way of representing no value.' }
      ],
      feynmanPrompt: 'Explain the difference between mutating a list and rebinding a variable to a new object.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'Which value is immutable in Python?',
        choices: ['list', 'dict', 'str', 'set'],
        answer: 2,
        explanation: 'Strings cannot be changed in place; any "change" creates a new string.',
        concept: 'immutability'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Fill the blank to convert text from input into a number.',
        code: 'count = _____(input("How many? "))',
        choices: ['int', 'list', 'str', 'bool'],
        answer: 0,
        explanation: 'int() is the correct cast when you want whole-number math.',
        concept: 'explicit conversion'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What is wrong with this check?',
        code: 'if value == None:\n    print("missing")',
        choices: [
          'Use is None for identity checks against None',
          'None cannot appear in an if statement',
          'The code must use elif instead',
          'The variable name value is reserved'
        ],
        answer: 0,
        explanation: 'None is a singleton, so identity comparison is the correct check.',
        concept: 'identity versus equality'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'What happens here?',
        code: 'items = [1, 2]\nother = items\nother.append(3)',
        choices: [
          'items stays [1, 2] because other is a copy',
          'items becomes [1, 2, 3] because both names point to the same list',
          'The code crashes because append returns a new list',
          'other becomes a tuple automatically'
        ],
        answer: 1,
        explanation: 'Both names reference the same mutable list object.',
        concept: 'aliasing and mutability'
      }
    ]
  },
  {
    id: 'loops-functions',
    name: 'Loops & Functions',
    category: 'language',
    icon: 'lf',
    color: '#f0a500',
    prereqs: ['python-basics'],
    estimatedHours: 3,
    brief: 'Iteration, parameters, and reusable behavior.',
    lesson: {
      estimatedMinutes: 34,
      sections: [
        {
          title: 'Loops are controlled repetition',
          body: 'A loop is just a way to repeat work until a condition changes. for-loops are for known sequences; while-loops are for conditions that need checking until they become false.',
          code: 'for item in items:\n    print(item)',
          tip: 'Choose the loop that matches the shape of the problem.'
        },
        {
          title: 'Functions make logic reusable',
          body: 'Functions let you name behavior. A good function has one clear job, takes the data it needs, and returns a result instead of hiding work in global state.',
          code: 'def total(nums):\n    return sum(nums)',
          tip: 'Prefer return values over hidden side effects.'
        },
        {
          title: 'Parameters and defaults',
          body: 'Default arguments are evaluated once when the function is defined, which is why mutable defaults are a common bug. *args and **kwargs let you accept flexible calling patterns.',
          code: 'def greet(name, prefix="Hi"):\n    return f"{prefix}, {name}"',
          tip: 'Never use a list or dict as a default unless you know why.'
        },
        {
          title: 'Lambda, break, and continue',
          body: 'lambda is for tiny throwaway functions. break exits a loop immediately; continue skips the rest of the current iteration and moves to the next one.',
          code: 'for n in nums:\n    if n == 0:\n        continue\n    print(n)',
          tip: 'The control-flow keyword should match the exact intent.'
        }
      ],
      keyTerms: [
        { term: 'loop', definition: 'A block of code that repeats.' },
        { term: 'return', definition: 'Sends a value back from a function.' },
        { term: 'parameter', definition: 'A named input to a function.' },
        { term: 'default argument', definition: 'A value used when the caller does not supply one.' },
        { term: 'lambda', definition: 'A short anonymous function.' }
      ],
      feynmanPrompt: 'Explain why a function should usually return a value instead of printing one.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'What does break do inside a loop?',
        choices: ['Skips to the next loop iteration', 'Stops the loop immediately', 'Stops the whole program', 'Restarts the loop from the top'],
        answer: 1,
        explanation: 'break exits the nearest loop right away.',
        concept: 'loop control'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Complete the function so it returns the square of n.',
        code: 'def square(n):\n    _____ n * n',
        choices: ['return', 'print', 'yield', 'pass'],
        answer: 0,
        explanation: 'return is how the function sends the result back to the caller.',
        concept: 'return values'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What is the bug in this function?',
        code: 'def add_one(items=[]):\n    items.append(1)\n    return items',
        choices: [
          'Mutable default arguments keep state between calls',
          'append cannot be used inside functions',
          'return should always be last',
          'The function name is invalid'
        ],
        answer: 0,
        explanation: 'The same list object is reused on every call.',
        concept: 'mutable default arguments'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'When should you use continue?',
        choices: [
          'When you want to exit the function',
          'When you want to skip one iteration but keep looping',
          'When you want to raise an error',
          'When you want to create a new list'
        ],
        answer: 1,
        explanation: 'continue jumps to the next loop iteration without ending the loop.',
        concept: 'loop flow control'
      }
    ]
  },
  {
    id: 'oop',
    name: 'OOP',
    category: 'cs-theory',
    icon: 'oo',
    color: '#a78bfa',
    prereqs: ['loops-functions'],
    estimatedHours: 3,
    brief: 'Classes, instances, inheritance, and polymorphism.',
    lesson: {
      estimatedMinutes: 36,
      sections: [
        {
          title: 'Objects bundle state and behavior',
          body: 'A class is a blueprint. An instance is a concrete object created from that blueprint. You use objects when you want data and the actions on that data to live together.',
          code: 'class Dog:\n    def __init__(self, name):\n        self.name = name',
          tip: 'Ask what data belongs with the object.'
        },
        {
          title: 'self is the instance',
          body: 'self is just the instance being worked on. Methods read and change instance data through self, which is why you must include it explicitly in method signatures.',
          code: 'class Dog:\n    def bark(self):\n        return f"{self.name} says woof"',
          tip: 'A method without self cannot see the instance.'
        },
        {
          title: 'Inheritance and super()',
          body: 'Inheritance lets one class reuse and extend another. super() calls the parent implementation so you can build on it instead of rewriting it from scratch.',
          code: 'class Cat(Animal):\n    def __init__(self, name):\n        super().__init__(name)',
          tip: 'Use inheritance when the child truly is a specialized version of the parent.'
        },
        {
          title: 'Polymorphism and dunder methods',
          body: 'Different objects can respond to the same operation in different ways. Dunder methods such as __len__ and __str__ let your custom objects fit naturally into Python conventions.',
          code: 'class Box:\n    def __len__(self):\n        return self.size',
          tip: 'Polymorphism is why the same code can work on different types.'
        }
      ],
      keyTerms: [
        { term: 'class', definition: 'A blueprint for making objects.' },
        { term: 'instance', definition: 'A concrete object created from a class.' },
        { term: 'inheritance', definition: 'A way to reuse and extend a parent class.' },
        { term: 'encapsulation', definition: 'Keeping data and behavior together.' },
        { term: 'polymorphism', definition: 'Different objects responding to the same operation.' }
      ],
      feynmanPrompt: 'Explain why self exists and what would break if you left it out of an instance method.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'What does __init__ do?',
        choices: ['Creates the class', 'Runs when a new instance is created', 'Deletes an object', 'Makes the class private'],
        answer: 1,
        explanation: '__init__ initializes the new instance after it is created.',
        concept: 'object initialization'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Complete the method signature so it can access instance data.',
        code: 'class User:\n    def greet(_____):\n        return f"Hi {self.name}"',
        choices: ['self', 'this', 'me', 'cls'],
        answer: 0,
        explanation: 'Instance methods need self as their first parameter.',
        concept: 'method binding'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What is wrong with this subclass?',
        code: 'class Dog(Animal):\n    def __init__(self, name):\n        self.name = name',
        choices: [
          'It forgot to call super().__init__(name) when the parent stores important state',
          'Subclassing is not allowed in Python',
          'The class name Dog must be lowercase',
          'self.name should always be a global variable'
        ],
        answer: 0,
        explanation: 'If the parent class sets up required state, skipping super() can leave the object incomplete.',
        concept: 'calling parent constructors'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'Which dunder method controls len(obj)?',
        choices: ['__size__', '__len__', '__count__', '__length__'],
        answer: 1,
        explanation: '__len__ is the Python protocol for len().',
        concept: 'dunder protocols'
      }
    ]
  },
  {
    id: 'data-structures',
    name: 'Data Structures',
    category: 'cs-theory',
    icon: 'ds',
    color: '#00e38c',
    prereqs: ['variables-types'],
    estimatedHours: 3,
    brief: 'Lists, dicts, sets, tuples, and tradeoffs.',
    lesson: {
      estimatedMinutes: 34,
      sections: [
        {
          title: 'Pick the right structure',
          body: 'A data structure is a decision about how you want to organize and access data. The right choice depends on whether you care about ordering, uniqueness, random access, or fast lookup.',
          code: 'items = ["a", "b"]\nlookup = {"a": 1}',
          tip: 'Choose the structure that makes the operation cheap.'
        },
        {
          title: 'Lists and tuples',
          body: 'Lists are mutable ordered sequences. Tuples are ordered too, but they are immutable. Use tuples when the data should not change.',
          code: 'point = (3, 4)\nitems = [1, 2, 3]',
          tip: 'If the collection should not be edited, tuple is often the cleaner choice.'
        },
        {
          title: 'Sets and dictionaries',
          body: 'Sets are for membership and uniqueness. Dictionaries are for key-value lookups. Both are hash-based, which is why membership checks are usually fast.',
          code: 'seen = {1, 2, 3}\nuser = {"name": "Ada"}',
          tip: 'Use a dict when you need to map keys to values.'
        },
        {
          title: 'Stacks, queues, and Big O',
          body: 'A stack is LIFO. A queue is FIFO. Big O tells you how runtime or memory grows as the input size grows, which helps you compare tradeoffs.',
          code: 'stack.append(4)\nvalue = stack.pop()',
          tip: 'Focus on growth, not exact milliseconds.'
        }
      ],
      keyTerms: [
        { term: 'list', definition: 'An ordered, mutable sequence.' },
        { term: 'tuple', definition: 'An ordered, immutable sequence.' },
        { term: 'set', definition: 'An unordered collection of unique values.' },
        { term: 'dict', definition: 'A key-value mapping.' },
        { term: 'Big O', definition: 'A way to describe how cost grows with input size.' }
      ],
      feynmanPrompt: 'Explain why you would choose a set over a list when checking if an item already exists.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'Which structure is best for fast membership checks?',
        choices: ['list', 'tuple', 'set', 'string'],
        answer: 2,
        explanation: 'Sets are optimized for membership tests.',
        concept: 'membership lookup'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Fill the blank to remove and return the last stack item.',
        code: 'value = stack.____()',
        choices: ['pop', 'push', 'append', 'remove'],
        answer: 0,
        explanation: 'pop() removes the last item and returns it.',
        concept: 'stack operations'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What is the problem here?',
        code: 'seen = []\nif x in seen:\n    ...',
        choices: [
          'A set is a better choice when you only need membership tests',
          'Lists cannot store values',
          'in is not allowed in Python',
          'The variable x must be a string'
        ],
        answer: 0,
        explanation: 'A set makes the membership test clearer and faster for this use case.',
        concept: 'list versus set'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'Which is immutable?',
        choices: ['list', 'dict', 'tuple', 'set'],
        answer: 2,
        explanation: 'Tuples cannot be changed in place.',
        concept: 'mutability'
      }
    ]
  },
  {
    id: 'algorithms',
    name: 'Algorithms',
    category: 'cs-theory',
    icon: 'al',
    color: '#e05c5c',
    prereqs: ['data-structures'],
    estimatedHours: 3.5,
    brief: 'Search, sort, recursion, and complexity thinking.',
    lesson: {
      estimatedMinutes: 38,
      sections: [
        {
          title: 'Complexity first',
          body: 'Before you optimize code, ask how the cost grows as the input gets bigger. Big O is the language we use to compare algorithmic tradeoffs.',
          code: 'O(1)\nO(n)\nO(log n)',
          tip: 'A slow algorithm on small input can still be the wrong design.'
        },
        {
          title: 'Binary search',
          body: 'Binary search only works on sorted data. Each step cuts the search space roughly in half, which is why it is so much faster than a linear scan.',
          code: 'while left <= right:\n    mid = (left + right) // 2',
          tip: 'If the input is not sorted, binary search is invalid.'
        },
        {
          title: 'Sorting and recursion',
          body: 'Merge sort splits the data, sorts each half, then merges them. Recursion is just a function solving a smaller version of the same problem until it hits a base case.',
          code: 'def mergesort(nums):\n    if len(nums) <= 1:\n        return nums',
          tip: 'Every recursive function needs a base case.'
        },
        {
          title: 'Two pointers',
          body: 'Two-pointer techniques are useful when you can move from both ends of a structure toward the middle. They often turn an otherwise quadratic problem into a linear one.',
          code: 'left, right = 0, len(nums) - 1\nwhile left < right:\n    ...',
          tip: 'Ask what invariant the pointers are maintaining.'
        }
      ],
      keyTerms: [
        { term: 'algorithm', definition: 'A step-by-step procedure for solving a problem.' },
        { term: 'base case', definition: 'The stopping condition in recursion.' },
        { term: 'binary search', definition: 'A search strategy that halves the search space each step.' },
        { term: 'merge sort', definition: 'A divide-and-conquer sorting algorithm.' },
        { term: 'two pointers', definition: 'A technique using two indices to scan data efficiently.' }
      ],
      feynmanPrompt: 'Explain why binary search fails if the input is not sorted.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'What is the time complexity of a standard binary search?',
        choices: ['O(1)', 'O(log n)', 'O(n log n)', 'O(n^2)'],
        answer: 1,
        explanation: 'Each step halves the search space.',
        concept: 'logarithmic search'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Complete the base case for recursive merge sort.',
        code: 'def mergesort(nums):\n    if len(nums) _____ 1:\n        return nums',
        choices: ['<=', '>=', '==', '<'],
        answer: 0,
        explanation: 'The recursion stops when the list has one item or fewer.',
        concept: 'base cases'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What is the flaw in this binary search?',
        code: 'mid = (left + right) // 2\nif nums[mid] < target:\n    left = mid\nelse:\n    right = mid',
        choices: [
          'left and right should move past mid, or the loop can stall',
          'Binary search cannot use integers',
          'mid must always be a float',
          'The array must be reversed'
        ],
        answer: 0,
        explanation: 'If you do not move past mid, the same midpoint can repeat forever.',
        concept: 'progress in loops'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'Why are two-pointer solutions often efficient?',
        choices: [
          'They always use recursion',
          'They can turn nested scans into a single pass',
          'They only work on sorted data',
          'They require hashing'
        ],
        answer: 1,
        explanation: 'Two pointers often let you avoid an inner loop.',
        concept: 'linear-time scan'
      }
    ]
  },
  {
    id: 'git-basics',
    name: 'Git Basics',
    category: 'tools',
    icon: 'gi',
    color: '#f0a500',
    prereqs: [],
    estimatedHours: 2.5,
    brief: 'Commit history, branches, merges, and recovery.',
    lesson: {
      estimatedMinutes: 30,
      sections: [
        {
          title: 'Git records snapshots',
          body: 'Git is not a file sync tool; it is a history machine. You make commits to capture snapshots of your project state so you can move around in time.',
          code: 'git init\ngit add .\ngit commit -m "start"',
          tip: 'A commit should tell a story about one change.'
        },
        {
          title: 'Branches let you experiment',
          body: 'A branch is a movable pointer to a line of commits. Create branches when you want to work on a feature or fix without disturbing main.',
          code: 'git checkout -b feature/login',
          tip: 'Branches are cheap; use them freely.'
        },
        {
          title: 'Merge, rebase, and conflicts',
          body: 'Merge combines histories. Rebase rewrites your work onto another base. Conflicts happen when Git cannot decide how to combine changes automatically.',
          code: 'git merge main\ngit rebase main',
          tip: 'Know when history is being rewritten.'
        },
        {
          title: 'Recover safely',
          body: 'Stash is for temporary shelving. reset moves branch pointers. pull brings remote changes down. push sends your commits up.',
          code: 'git stash\ngit pull --rebase\ngit push',
          tip: 'Use reset with care because it can move history.'
        }
      ],
      keyTerms: [
        { term: 'commit', definition: 'A saved snapshot in Git history.' },
        { term: 'branch', definition: 'A movable pointer to a line of commits.' },
        { term: 'merge', definition: 'Combining work from different branches.' },
        { term: 'rebase', definition: 'Replaying commits onto a new base.' },
        { term: 'stash', definition: 'Temporarily storing unfinished changes.' }
      ],
      feynmanPrompt: 'Explain the difference between merge and rebase in plain English.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'What does git add do?',
        choices: ['Deletes files from the repo', 'Stages changes for the next commit', 'Pushes to GitHub', 'Creates a branch'],
        answer: 1,
        explanation: 'git add places changes into the staging area.',
        concept: 'staging'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Complete the command to create and switch to a new branch.',
        code: 'git _____ feature/login',
        choices: ['checkout -b', 'push origin', 'merge', 'stash'],
        answer: 0,
        explanation: 'git checkout -b makes the branch and moves you onto it.',
        concept: 'branch creation'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What should you be careful about here?',
        code: 'git reset --hard HEAD~1',
        choices: [
          'It permanently discards local work not stored elsewhere',
          'It only updates remote branches',
          'It creates a merge conflict',
          'It is the same as git add'
        ],
        answer: 0,
        explanation: 'hard reset moves the branch and removes uncommitted changes.',
        concept: 'destructive history moves'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'What is the point of git stash?',
        choices: [
          'To publish code to the server',
          'To save unfinished changes temporarily',
          'To delete the last commit',
          'To make a pull request'
        ],
        answer: 1,
        explanation: 'Stash is a temporary shelf for work in progress.',
        concept: 'temporary storage'
      }
    ]
  },
  {
    id: 'linux-cli',
    name: 'Linux CLI',
    category: 'tools',
    icon: 'lx',
    color: '#388bfd',
    prereqs: [],
    estimatedHours: 2.5,
    brief: 'Shell commands, processes, permissions, and pipes.',
    lesson: {
      estimatedMinutes: 32,
      sections: [
        {
          title: 'Navigate and inspect',
          body: 'The shell is a text interface for interacting with files, processes, and programs. Start with ls, cd, pwd, and find until moving around feels automatic.',
          code: 'pwd\nls -la\ncd src',
          tip: 'Know where you are before you change anything.'
        },
        {
          title: 'Search with grep and find',
          body: 'grep searches text. find searches the filesystem. Pipes let you connect commands so the output of one becomes the input of another.',
          code: 'grep -R "TODO" .\nfind . -name "*.py"',
          tip: 'Search problems often need both text and path filters.'
        },
        {
          title: 'Permissions and processes',
          body: 'chmod changes permissions. ps shows running processes. kill sends signals to stop them. The shell is often the quickest way to inspect what the system is doing.',
          code: 'ps aux | grep python\nkill 12345',
          tip: 'Learn the common signals before you need them.'
        },
        {
          title: 'Environment and remote work',
          body: 'env prints environment variables, curl fetches URLs, and ssh opens remote sessions. These commands are the daily bread of many dev workflows.',
          code: 'env | grep PATH\ncurl https://example.com',
          tip: 'A tiny command chain can replace a lot of manual clicking.'
        }
      ],
      keyTerms: [
        { term: 'pipe', definition: 'Sends output from one command into another.' },
        { term: 'permission', definition: 'Whether a file can be read, written, or executed.' },
        { term: 'process', definition: 'A running program.' },
        { term: 'environment variable', definition: 'A key-value setting available to programs.' },
        { term: 'ssh', definition: 'A secure way to access a remote machine.' }
      ],
      feynmanPrompt: 'Explain the difference between grep and find using a concrete example.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'Which command prints the current directory?',
        choices: ['ls', 'pwd', 'cd', 'grep'],
        answer: 1,
        explanation: 'pwd means print working directory.',
        concept: 'navigation'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Complete the pipe to search recursively for TODO comments.',
        code: 'grep -R "TODO" _____',
        choices: ['.', '--help', 'cd', 'chmod'],
        answer: 0,
        explanation: 'A dot tells grep to search the current directory tree.',
        concept: 'recursive search'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What is wrong with this command?',
        code: 'rm /important/file.txt',
        choices: [
          'It permanently deletes a file without confirmation in many setups',
          'rm only works on directories',
          'The path must start with ./',
          'The command will open the file instead'
        ],
        answer: 0,
        explanation: 'rm is destructive, so you should double-check the path before running it.',
        concept: 'destructive commands'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'What does chmod +x do?',
        choices: ['Makes a file executable', 'Deletes a file', 'Changes ownership', 'Shows hidden files'],
        answer: 0,
        explanation: '+x adds execute permission.',
        concept: 'permissions'
      }
    ]
  },
  {
    id: 'networking-basics',
    name: 'Networking Basics',
    category: 'security',
    icon: 'nw',
    color: '#00e38c',
    prereqs: [],
    estimatedHours: 3,
    brief: 'HTTP, DNS, TCP/IP, ports, and request flow.',
    lesson: {
      estimatedMinutes: 34,
      sections: [
        {
          title: 'What a network stack does',
          body: 'Networking is the path from one program to another across machines. IP addresses identify hosts, ports identify processes, and protocols describe how messages are shaped and delivered.',
          code: 'IP address\nPort 443\nHTTPS request',
          tip: 'Separate the machine from the app on that machine.'
        },
        {
          title: 'DNS and IP',
          body: 'DNS translates human-friendly names into IP addresses. Once you have the IP, the client can start talking to the server over the chosen protocol.',
          code: 'example.com -> DNS -> 93.184.216.34',
          tip: 'Name lookup happens before the real connection starts.'
        },
        {
          title: 'TCP, UDP, and HTTP',
          body: 'TCP is connection-oriented and reliable. UDP is lighter and faster but does not guarantee delivery. HTTP runs on top and defines request and response semantics.',
          code: 'GET /api/items HTTP/1.1\nHost: example.com',
          tip: 'Think reliability versus latency when comparing TCP and UDP.'
        },
        {
          title: 'Localhost and debugging',
          body: 'localhost points back to your own machine. ping checks reachability, traceroute shows the path, and curl is a simple way to inspect responses.',
          code: 'curl http://localhost:3000\nping 8.8.8.8',
          tip: 'When a service fails, start by checking where the request stops.'
        }
      ],
      keyTerms: [
        { term: 'IP address', definition: 'A numeric address for a networked host.' },
        { term: 'port', definition: 'The endpoint number for a process on a machine.' },
        { term: 'DNS', definition: 'The system that maps names to IP addresses.' },
        { term: 'TCP', definition: 'A reliable transport protocol.' },
        { term: 'HTTP', definition: 'The protocol used for web requests and responses.' }
      ],
      feynmanPrompt: 'Explain why a browser needs both DNS and ports before it can load a web page.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'What does DNS do?',
        choices: ['Encrypts traffic', 'Maps names to IP addresses', 'Assigns MAC addresses', 'Blocks malware'],
        answer: 1,
        explanation: 'DNS turns names like example.com into IP addresses.',
        concept: 'name resolution'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Fill the blank: HTTPS usually runs on port _____.',
        code: 'https://example.com uses port _____ by default',
        choices: ['80', '443', '22', '53'],
        answer: 1,
        explanation: 'Port 443 is the standard HTTPS port.',
        concept: 'common ports'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What is the issue with this statement?',
        code: 'HTTP is the same thing as TCP',
        choices: [
          'HTTP is an application protocol that runs on top of TCP or other transports',
          'TCP only exists on Linux',
          'HTTP is for encryption only',
          'TCP cannot carry any application data'
        ],
        answer: 0,
        explanation: 'HTTP and TCP live at different layers of the network stack.',
        concept: 'protocol layers'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'What does localhost mean?',
        choices: ['A remote production server', 'Your own machine', 'Any Wi-Fi router', 'The public internet'],
        answer: 1,
        explanation: 'localhost points back to the current computer.',
        concept: 'loopback address'
      }
    ]
  },
  {
    id: 'cybersecurity-101',
    name: 'Cybersecurity 101',
    category: 'security',
    icon: 'cs',
    color: '#e05c5c',
    prereqs: ['networking-basics'],
    estimatedHours: 3,
    brief: 'CIA triad, phishing, hashing, XSS, SQLi, and MFA.',
    lesson: {
      estimatedMinutes: 36,
      sections: [
        {
          title: 'Security starts with the CIA triad',
          body: 'Confidentiality means only the right people can see the data. Integrity means the data was not altered unexpectedly. Availability means the system is there when you need it.',
          code: 'confidentiality\nintegrity\navailability',
          tip: 'Use the triad to frame almost every security discussion.'
        },
        {
          title: 'Hashing is not encryption',
          body: 'Encryption is reversible with a key. Hashing is one-way and is used to verify data or store passwords more safely. You should never try to "decrypt" a hash.',
          code: 'hash = sha256(password)\ncompare(hash, stored_hash)',
          tip: 'Passwords are usually hashed, not encrypted.'
        },
        {
          title: 'Common web attacks',
          body: 'Phishing tricks people. SQL injection tricks databases. XSS tricks browsers. Each attack targets a different layer of the system, so defenses need to be layered too.',
          code: 'SELECT * FROM users WHERE name = ?\nhtml.escape(user_input)',
          tip: 'Input validation is not the same as output encoding.'
        },
        {
          title: 'Passwords and MFA',
          body: 'Good password security uses long, unique passwords stored in a password manager. MFA adds another factor, which dramatically raises the cost of account takeover.',
          code: 'password manager -> unique password -> MFA code',
          tip: 'A leaked password is much less dangerous when MFA is enabled.'
        }
      ],
      keyTerms: [
        { term: 'CIA triad', definition: 'Confidentiality, integrity, and availability.' },
        { term: 'hashing', definition: 'A one-way transformation used for integrity or password storage.' },
        { term: 'phishing', definition: 'Social engineering that tries to trick someone into revealing secrets.' },
        { term: 'XSS', definition: 'A browser attack that injects malicious script into a page.' },
        { term: 'MFA', definition: 'Multi-factor authentication.' }
      ],
      feynmanPrompt: 'Explain why hashing passwords is safer than storing them in plain text.'
    },
    questions: [
      {
        type: 'mcq',
        difficulty: 'easy',
        question: 'Which part of the CIA triad means data was not altered unexpectedly?',
        choices: ['Confidentiality', 'Integrity', 'Availability', 'Authentication'],
        answer: 1,
        explanation: 'Integrity is about correctness and tamper resistance.',
        concept: 'CIA triad'
      },
      {
        type: 'code-fill',
        difficulty: 'medium',
        question: 'Complete the pattern that helps prevent SQL injection.',
        code: 'cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))  # _____',
        choices: ['parameterized query', 'plain string concat', 'hashing', 'XSS filter'],
        answer: 0,
        explanation: 'Parameterized queries keep user data separate from SQL syntax.',
        concept: 'SQL injection defense'
      },
      {
        type: 'debug',
        difficulty: 'hard',
        question: 'What is wrong with this password storage?',
        code: 'stored = password\n# save stored to the database',
        choices: [
          'Passwords should be hashed, not stored in plain text',
          'Passwords must always be lowercase',
          'The database should not be used for users',
          'Passwords cannot contain symbols'
        ],
        answer: 0,
        explanation: 'Plain text passwords are a serious security failure.',
        concept: 'password storage'
      },
      {
        type: 'mcq',
        difficulty: 'medium',
        question: 'What does MFA add?',
        choices: ['A second factor', 'More database rows', 'Faster login', 'Automatic encryption'],
        answer: 0,
        explanation: 'MFA requires another proof in addition to the password.',
        concept: 'authentication factors'
      }
    ]
  }
]

function expandQuestions(topic) {
  return Array.from({ length: 12 }, (_, index) => {
    const template = topic.questions[index % topic.questions.length]
    const question = { ...template }
    if (index >= topic.questions.length) {
      question.question = `${question.question} (variant ${index + 1})`
    }
    const prefix = topic.id.replace(/[^a-z]/g, '').slice(0, 2) || 'tx'
    return {
      id: `${prefix}-${String(index + 1).padStart(3, '0')}`,
      ...question
    }
  })
}

const questionsJson = {}
const lessonsJson = { lessons: {} }

for (const topic of topicSpecs) {
  const questions = expandQuestions(topic)
  const lesson = topic.lesson
  questionsJson[topic.id] = questions
  lessonsJson.lessons[topic.id] = lesson

  const pack = {
    id: topic.id,
    name: topic.name,
    version: '1.0.0',
    author: 'Recurse',
    category: topic.category,
    tags: [topic.id.split('-')[0], topic.category, topic.name.toLowerCase()],
    description: topic.brief,
    icon: topic.icon,
    color: topic.color,
    prereqs: topic.prereqs,
    estimatedHours: topic.estimatedHours,
    questions,
    lesson
  }

  writeFileSync(join(packsDir, `${topic.id}.json`), JSON.stringify(pack, null, 2) + '\n')
}

writeFileSync(join(dataDir, 'questions.json'), JSON.stringify(questionsJson, null, 2) + '\n')
writeFileSync(join(dataDir, 'lessons.json'), JSON.stringify(lessonsJson, null, 2) + '\n')

console.log(JSON.stringify({ totalTopics: topicSpecs.length, totalQuestions: topicSpecs.length * 12 }, null, 2))
