// Every interactive activity Recurse knows about. Plain data so the pack validator
// (Node) and the app share one list. The component for a type lives in
// ./widgets/<type>.jsx and is loaded on demand.
//
// `props` documents what content may pass in `section.activity.props`. Every prop is
// optional; widgets fall back to sensible defaults. `goal` is the default goal shown
// above the widget; content can override it with `activity.goal`.

export const ACTIVITY_GROUPS = {
  cs: 'Computer science',
  code: 'Coding',
  tools: 'Developer tools',
  network: 'Networking',
  math: 'Math and science'
}

export const ACTIVITIES = [
  // ---- Computer science ----
  { type: 'sort-visualizer', group: 'cs', title: 'Sorting visualizer', description: 'Step through bubble, selection, insertion, merge and quick sort and count comparisons and swaps.', goal: 'Sort the array with two different algorithms and compare their comparison counts.', props: { algorithms: 'array of "bubble" | "selection" | "insertion" | "merge" | "quick"', size: 'number of bars, 6 to 24', values: 'optional starting array of numbers' } },
  { type: 'binary-search', group: 'cs', title: 'Binary search', description: 'Find a target in a sorted array by halving the search range, watching low, mid and high move.', goal: 'Find the target in no more than log2(n) + 1 probes.', props: { size: 'array length, 8 to 64' } },
  { type: 'big-o', group: 'cs', title: 'Growth rates', description: 'Drag n and watch O(1), O(log n), O(n), O(n log n), O(n^2) and O(2^n) race apart, then rank them.', goal: 'Rank the growth rates from slowest to fastest growing.', props: { classes: 'array of "1" | "log n" | "n" | "n log n" | "n^2" | "2^n" | "n!"' } },
  { type: 'stack-queue', group: 'cs', title: 'Stacks and queues', description: 'Push, pop, enqueue and dequeue, then solve small tasks such as matching brackets with a stack.', goal: 'Complete the challenge task using the right operations.', props: { mode: '"stack" | "queue" | "both"' } },
  { type: 'linked-list', group: 'cs', title: 'Linked list', description: 'Insert, delete and reverse nodes and watch the next pointers rewire.', goal: 'Reverse the list by rewiring pointers.', props: { values: 'starting values' } },
  { type: 'hash-table', group: 'cs', title: 'Hash table', description: 'Insert keys, see the hash and bucket for each, watch collisions chain and the load factor grow.', goal: 'Insert keys until the load factor passes 0.75, then resize.', props: { buckets: 'starting bucket count, 4 to 16' } },
  { type: 'bst', group: 'cs', title: 'Binary search tree', description: 'Insert and search values, see the path taken and run in-order, pre-order and post-order traversals.', goal: 'Search for a value and predict the in-order traversal.', props: { values: 'starting values' } },
  { type: 'graph-search', group: 'cs', title: 'Graph search', description: 'Draw walls on a grid and watch BFS and DFS explore it; BFS finds the shortest path.', goal: 'Run BFS and DFS on the same maze and compare path lengths.', props: { algorithm: '"bfs" | "dfs" | "both"' } },
  { type: 'recursion-tree', group: 'cs', title: 'Recursion tree', description: 'Watch the call tree and call stack for fib, factorial or sum, with and without memoization.', goal: 'Compare the number of calls with and without memoization.', props: { fn: '"fib" | "factorial" | "sum"', n: 'argument, 1 to 8', memo: 'boolean' } },
  { type: 'dp-table', group: 'cs', title: 'Dynamic programming table', description: 'Fill a DP table cell by cell for grid paths, coin change or longest common subsequence.', goal: 'Fill the table and read the answer from the right cell.', props: { problem: '"grid-paths" | "coin-change" | "lcs"' } },
  { type: 'logic-gates', group: 'cs', title: 'Logic gates', description: 'Toggle inputs through AND, OR, NOT, XOR, NAND and NOR, then fill in truth tables.', goal: 'Complete the truth table for the target gate.', props: { gates: 'array of gate names', target: 'gate to quiz on' } },
  { type: 'binary-bits', group: 'cs', title: 'Binary and hex', description: 'Flip bits to build numbers and convert between binary, decimal and hex.', goal: 'Hit five target numbers by flipping bits.', props: { bits: '4, 8 or 16', rounds: 'number of targets' } },
  { type: 'cpu-scheduling', group: 'cs', title: 'CPU scheduling', description: 'Run FCFS, SJF and round robin on the same processes and compare average waiting time.', goal: 'Find the algorithm with the lowest average waiting time.', props: { algorithms: 'array of "fcfs" | "sjf" | "rr"' } },

  // ---- Coding ----
  { type: 'code-runner', group: 'code', title: 'Code playground', description: 'Edit and run a short JavaScript or Python program in the browser and see its output.', goal: 'Run the code, then change it and run it again.', props: { language: '"javascript" | "python"', code: 'starting code', task: 'optional instruction', expectOutput: 'optional exact output that completes the goal' } },
  { type: 'challenge', group: 'code', title: 'Coding challenge', description: 'Solve a coding problem against hidden and visible tests, in JavaScript or Python.', goal: 'Pass every test.', props: { id: 'challenge id from src/data/challenges' } },

  // ---- Developer tools ----
  { type: 'git-sim', group: 'tools', title: 'Git sandbox', description: 'Type git commands and watch the commit graph, branches and HEAD update.', goal: 'Complete the scenario steps.', props: { scenario: '"basics" | "branching" | "merge-conflict" | "rebase"' } },
  { type: 'terminal', group: 'tools', title: 'Linux terminal', description: 'A simulated shell with a small file system: navigate, create, move, search and pipe.', goal: 'Complete the scenario tasks.', props: { scenario: '"navigation" | "files" | "permissions" | "pipes"' } },
  { type: 'regex-tester', group: 'tools', title: 'Regex tester', description: 'Write a pattern and see matches highlighted live, then solve match/do-not-match puzzles.', goal: 'Solve the puzzles.', props: { puzzles: 'array of { prompt, match: [strings], noMatch: [strings] }' } },
  { type: 'http-explorer', group: 'tools', title: 'HTTP explorer', description: 'Build requests to a mock REST API, choosing method, path, headers and body, and read the responses and status codes.', goal: 'Complete the API tasks.', props: { scenario: '"rest-basics" | "auth" | "errors"' } },
  { type: 'json-explorer', group: 'tools', title: 'JSON explorer', description: 'Explore a JSON document as a tree, read paths and types, and answer questions about it.', goal: 'Answer the path questions.', props: { json: 'optional JSON text' } },

  // ---- Networking ----
  { type: 'ios-console', group: 'network', title: 'Cisco IOS console', description: 'A simulated Cisco router or switch CLI with modes, abbreviations, show commands and live grading.', goal: 'Pass every lab check.', props: { lab: 'console lab id, or omit for a free sandbox', device: '"router" | "switch" for the sandbox' } },
  { type: 'subnet-drill', group: 'network', title: 'Subnetting drill', description: 'Calculate network, broadcast, host range and hosts for random addresses, against the clock if you like.', goal: 'Answer five subnets correctly.', props: { mode: '"calc" | "drill"', difficulty: '"easy" | "medium" | "hard"' } },
  { type: 'packet-journey', group: 'network', title: 'Packet journey', description: 'Follow a packet from host to host: encapsulation, ARP, switching and routing hop by hop.', goal: 'Step through the whole journey and answer the checkpoint questions.', props: {} },
  { type: 'mac-learning', group: 'network', title: 'Switch MAC learning', description: 'Send frames between hosts and watch the switch learn, flood, forward and filter.', goal: 'Fill the MAC table so no frame needs flooding.', props: {} },
  { type: 'osi-layers', group: 'network', title: 'OSI layer sort', description: 'Drag protocols, devices and PDUs onto the right OSI layer.', goal: 'Place every item on the right layer.', props: {} },
  { type: 'tcp-handshake', group: 'network', title: 'TCP and UDP', description: 'Animate the three-way handshake, data with acknowledgments, loss and retransmission, and compare with UDP.', goal: 'Step through the handshake and a lost segment.', props: {} },
  { type: 'stp-election', group: 'network', title: 'Spanning tree election', description: 'Change bridge priorities and link costs, then predict the root bridge, root ports and blocked ports.', goal: 'Predict the root bridge and blocked port correctly.', props: {} },
  { type: 'vlan-trunk', group: 'network', title: 'VLANs and trunks', description: 'Assign ports to VLANs and configure a trunk, then test which hosts can reach each other.', goal: 'Make the same-VLAN hosts on both switches reach each other.', props: {} },
  { type: 'route-lookup', group: 'network', title: 'Routing table lookup', description: 'Pick the route a router uses for a destination by longest prefix match, then administrative distance and metric.', goal: 'Choose the right route for five destinations.', props: {} },
  { type: 'acl-tester', group: 'network', title: 'ACL tester', description: 'Build an access list and send test packets through it to see which line matches, including the implicit deny.', goal: 'Write an ACL that meets the policy.', props: {} },
  { type: 'nat-table', group: 'network', title: 'NAT and PAT', description: 'Send inside hosts to the internet through static NAT, a pool and PAT, and watch the translation table.', goal: 'Explain which translation each flow gets.', props: {} },
  { type: 'dhcp-dora', group: 'network', title: 'DHCP DORA', description: 'Step through Discover, Offer, Request and Acknowledge, including a relay agent across a router.', goal: 'Complete a lease through a relay.', props: {} },
  { type: 'ipv6-tool', group: 'network', title: 'IPv6 compressor', description: 'Compress and expand IPv6 addresses and build EUI-64 interface IDs.', goal: 'Compress five addresses correctly.', props: {} },
  { type: 'ospf-cost', group: 'network', title: 'OSPF cost', description: 'Change interface bandwidths and the reference bandwidth and watch the best path change.', goal: 'Make traffic take the other path by changing costs.', props: {} },

  // ---- Math and science ----
  { type: 'function-plot', group: 'math', title: 'Function plotter', description: 'Plot functions with sliders for their parameters and see slope and area change.', goal: 'Match the target curve.', props: { preset: '"linear" | "quadratic" | "exponential" | "sine"' } },
  { type: 'probability-sim', group: 'math', title: 'Probability simulator', description: 'Flip coins, roll dice or run the birthday problem thousands of times and watch frequencies converge.', goal: 'Predict the long-run result, then run enough trials to check it.', props: { experiment: '"coin" | "dice" | "birthday"' } }
]

export const ACTIVITY_TYPES = ACTIVITIES.map((a) => a.type)
export const ACTIVITY_MAP = Object.fromEntries(ACTIVITIES.map((a) => [a.type, a]))
