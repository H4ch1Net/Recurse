# Computer Science Degree: what the goal requires

Source: a typical ACM/IEEE-style undergraduate curriculum (CS2013 / CC2020 knowledge areas) as taught
at most US universities, in the usual order. Mapped to Recurse packs.

| # | Course (typical year) | What the course and its exams require | Recurse topics |
|---|---|---|---|
| 1 | How to study CS (Y1) | Reading texts and notes actively, problem sets, proof write-ups, debugging assignments, office hours, collaboration and integrity rules, exam prep with past papers, git for projects | cs-study-skills (NEW), learning-science, swe-debugging, git-basics |
| 2 | CS1 Intro programming (Y1 F) | Types, control flow, functions, lists/dicts, strings, files, exceptions, classes, recursion basics, testing | python-basics, variables-types, loops-functions, python-intermediate, oop, java-basics (other agent; many CS1/CS2 use Java) |
| 3 | Calculus I/II (Y1) | Limits, derivatives, optimization, integrals, FTC, substitution | algebra-essentials, calculus-intro |
| 4 | CS2 Data structures (Y1 S) | ADTs, arrays/dynamic arrays, linked lists, stacks/queues, hash tables, trees/BSTs, heaps, graphs intro, Big-O, recursion, invariants | big-o, data-structures, swe-linked-lists, swe-stacks-queues, swe-hash-maps, swe-trees, swe-heaps, swe-recursion-backtracking, swe-advanced-structures (other agent), swe-testing |
| 5 | Discrete math (Y1 S) | Logic, quantifiers, sets, counting, proofs (direct, contradiction, induction), modular arithmetic, graphs | discrete-math-logic, cs-study-skills (proof write-ups) |
| 6 | Computer organization (Y2 F) | Binary, two's complement, floating point, gates, datapath, ISA, machine code, memory hierarchy, caches, pipelines | cs-number-systems, cs-computer-architecture, swe-bit-manipulation |
| 7 | Systems programming in C (Y2 F) | Pointers, arrays, structs, malloc/free, stack vs heap, UB, compiling and linking, gdb, valgrind, Unix tools | c-memory (other agent), cs-how-code-runs, linux-cli, swe-debugging; project c-unix-shell (NEW) |
| 8 | Linear algebra (Y2) | Vectors, matrices, systems, determinants, rank, eigenvectors | linear-algebra-basics |
| 9 | Algorithms (Y2 S) | Recurrences and the master theorem, divide and conquer, sorting lower bounds awareness, greedy with exchange proofs, DP formulation, shortest paths (Dijkstra, Bellman-Ford, Floyd-Warshall), MSTs and union-find, topological sort, SCCs, max flow awareness, amortized analysis, NP-completeness | algorithms, swe-graphs, swe-dynamic-programming, swe-greedy-intervals, cs-algorithms-advanced (NEW) |
| 10 | Probability and statistics (Y2) | Rules, conditional probability, Bayes, expectation, distributions | probability-statistics |
| 11 | Operating systems (Y3 F) | Syscalls, processes, threads, scheduling, virtual memory, synchronization, deadlock, file systems; fork/exec/wait shell assignment | operating-systems, swe-concurrency; project c-unix-shell |
| 12 | Computer networks (Y3 F) | Layering, application layer (HTTP, DNS), TCP/UDP, reliable transfer, IP addressing and subnetting, routing (link state uses Dijkstra, distance vector uses Bellman-Ford), link layer | networking-basics, ccna-osi-tcp-udp, ccna-subnetting, http-web, cs-algorithms-advanced (routing algorithms) |
| 13 | Databases (Y3 S) | Relational model, SQL, joins, aggregates, normalization, indexes, transactions and ACID | sql-basics, swe-databases |
| 14 | Theory of computation (Y3 S) | Languages, DFA/NFA, subset construction, regular expressions, closure, pumping lemma, CFGs and PDAs, Turing machines, Church-Turing, decidability, halting problem, reductions, P vs NP, NP-completeness | cs-theory-computation (NEW), regex-basics |
| 15 | Programming languages and compilers (Y4 F) | Paradigms, typing disciplines, scope and binding, closures, evaluation strategies, memory management, lexing, parsing, ASTs, semantic analysis, IR, optimization, codegen, interpreters and JITs | cs-programming-languages (NEW), cs-how-code-runs |
| 16 | Security (Y4 F, often required) | Threat models, crypto basics, secure coding | cybersecurity-101, cryptography-basics, swe-web-security |
| 17 | Software engineering and capstone (Y4 S) | Team git workflow, code review, testing, design principles and patterns, debugging, requirements to design, system design basics, APIs | swe-git-collaboration, swe-testing, swe-clean-code, swe-design-patterns, swe-oop-design (other agent), swe-apis-rest, system-design-101; projects rest-api-with-db, full-stack-app, open-source-contribution |
| 18 | Portfolio milestones | DS library, algorithm visualizer, a systems project (shell), a team-style capstone | data-structures-library, algorithm-visualizer, c-unix-shell (NEW), full-stack-app, open-source-contribution |

## Gaps found

- No pack taught automata, computability or complexity classes: cs-theory-computation.
- Algorithms course content beyond interview patterns was missing: master theorem, proofs (exchange
  argument, D&C correctness), Dijkstra/Bellman-Ford/Floyd-Warshall, Kruskal/Prim, SCCs, flow,
  amortized potential method, reductions: cs-algorithms-advanced.
- Paradigms, typing disciplines, evaluation strategies and the compiler front/middle/back end were
  missing (cs-how-code-runs only covers compiler vs interpreter, bytecode, GC, closures): cs-programming-languages.
- learning-science teaches the general research (spacing, retrieval, interleaving); discrete-math-logic
  has one short proof section; nothing covers problem sets, proof write-ups for grading, office hours,
  academic integrity or CS exam preparation with past papers: cs-study-skills.
- No systems project (C + OS): c-unix-shell.

Not filled (outside my ownership, noted in report): discrete-math depth on relations, functions and
number theory (gcd, Euclid); assembly language programming; a functional-language course.
