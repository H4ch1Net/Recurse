# Lesson visuals

A lesson section can carry **visuals**: tables, diagrams, worked examples and charts drawn by
the app instead of typed as monospace text. They read well on a 360px phone, follow the theme
(light, dark and every accent), and take far fewer words than prose.

Never put a diagram, an aligned table, a column of numbers or a calculation in a code block.
Code blocks are for real code, configuration and command output only (`section.code` with a
`language`, such as `cisco` for IOS). Anything else becomes a visual.

## Where visuals go

```json
{
  "title": "How a router reads an ACL",
  "key": "The first matching line decides, and an invisible deny any catches the rest.",
  "body": "Short paragraph.\n\n[[visual]]\n\nAnother short paragraph.\n\n[[visual 2]]",
  "visual": [ { "type": "flow", "...": "..." }, { "type": "table", "...": "..." } ],
  "code": "R1(config)# access-list 10 permit any",
  "language": "cisco"
}
```

- `visual` is one visual object or an array of up to 4.
- Place them inside `body` with a paragraph that is exactly `[[visual]]` (the first one),
  `[[visual 2]]`, `[[visual 3]]` or `[[visual 4]]`. `[[code]]` places the code block. Anything
  not placed renders after the body: visuals first, then code.
- Every visual takes an optional `title` (a short caption above it) and `caption` (a note
  below it). All text fields accept the inline markup used everywhere: `` `code` `` and `**bold**`.
- `tone`, where allowed, is one of `accent`, `good`, `bad`, `warn`, `muted`.

## Types

### table

Rows and columns. Use it for anything that lines up: comparisons, port lists, command
summaries, complexity tables.

```json
{
  "type": "table",
  "title": "Sorting compared",
  "columns": ["Algorithm", "Best", "Average", "Worst", "Stable"],
  "rows": [
    ["Insertion sort", "O(n)", "O(n^2)", "O(n^2)", "yes"],
    ["Merge sort", "O(n log n)", "O(n log n)", "O(n log n)", "yes"]
  ],
  "mono": [1, 2, 3],
  "highlight": [1]
}
```

- 2 to 6 columns, up to 16 rows. Every row has one cell per column.
- `mono`: column indexes drawn in monospace. `highlight`: row indexes to emphasize.
- On a phone, a table with 4 or more columns turns into one card per row: the first cell is
  the card title and the others are listed as "Column: value". Keep the first column a name.

### compare

Two or three things side by side, each with a few points. Side by side on wide screens,
stacked on phones.

```json
{
  "type": "compare",
  "items": [
    { "title": "TCP", "tone": "accent", "points": ["Connection first: three-way handshake", "Retransmits lost segments"] },
    { "title": "UDP", "points": ["No connection setup", "No retransmission: the app decides"] }
  ]
}
```

- 2 or 3 items, each with 1 to 6 short points. Optional `sub` under the title.

### steps

A worked example: numbered steps, each with an optional short piece of work shown in
monospace, ending in a result. Use it for every calculation (subnetting, wildcard masks,
Big-O counting, binary conversion).

```json
{
  "type": "steps",
  "title": "Wildcard for 172.16.32.0/20",
  "steps": [
    { "label": "Write the subnet mask", "work": "255.255.240.0" },
    { "label": "Subtract each octet from 255", "work": "255 - 240 = 15", "note": "the other octets give 0 and 255" }
  ],
  "result": "`172.16.32.0 0.0.15.255`"
}
```

- 2 to 8 steps. `work` is at most 3 lines of about 30 characters (use `\n` between lines).

### flow

A process or decision procedure, top to bottom.

```json
{
  "type": "flow",
  "title": "How a router reads an ACL",
  "steps": [
    { "label": "A packet arrives on an interface with an ACL" },
    { "label": "Does the next line match?", "yes": "Take its action and stop", "no": "Try the line after it" },
    { "label": "No line matched", "detail": "The implicit deny any drops it", "tone": "bad" }
  ],
  "loop": "Repeat for every line, top down"
}
```

- 2 to 8 steps. `detail` is a short second line. `yes` and `no` turn a step into a decision:
  `yes` is drawn as a branch to the side, `no` continues down (use `no` text to say what
  continuing means).
- `loop` draws a return arrow from the last step back to the first with that label (cycles
  such as a machine learning lifecycle).
- `"direction": "across"` lays short steps left to right on wide screens (no details or
  decisions, at most 5 steps). Phones always stack.

### stack

Layers drawn as a stack: OSI and TCP/IP, protocol stacks, encapsulation order, call stacks.

```json
{
  "type": "stack",
  "layers": [
    { "label": "Application", "tag": "7", "detail": "HTTP, DNS, SSH" },
    { "label": "Transport", "tag": "4", "detail": "TCP, UDP: ports", "tone": "accent" }
  ],
  "groups": [{ "label": "TCP/IP Application", "from": 0, "to": 2 }],
  "arrow": "down",
  "arrowLabel": "Sending: each layer adds its header"
}
```

- 2 to 9 layers, top first. `groups` bracket a run of layers (indexes, inclusive).
- `arrow`: `down`, `up` or `both`, with an optional `arrowLabel`.

### bars

Horizontal bars for comparing sizes: growth rates, costs, utilization.

```json
{
  "type": "bars",
  "title": "Steps for n = 1,000,000",
  "scale": "log",
  "items": [
    { "label": "O(log n)", "value": 20 },
    { "label": "O(n)", "value": 1000000, "display": "1,000,000" },
    { "label": "O(n^2)", "value": 1e12, "display": "10^12", "tone": "bad" }
  ]
}
```

- 2 to 10 items. `scale`: `linear` (default) or `log`. `display` overrides the printed value.
  `unit` is appended to printed values.

### sequence

A ladder diagram: messages between two to five parties over time. DHCP, ARP, TCP handshakes,
DNS lookups, HTTP requests, OAuth, STP, 802.1X.

```json
{
  "type": "sequence",
  "actors": [
    { "id": "pc", "label": "PC", "kind": "pc" },
    { "id": "srv", "label": "DHCP server", "kind": "server" }
  ],
  "messages": [
    { "from": "pc", "to": "srv", "label": "Discover", "detail": "broadcast", "tone": "accent" },
    { "from": "srv", "to": "pc", "label": "Offer", "detail": "10.1.1.20, 24 h lease", "dashed": true },
    { "note": "The PC now uses 10.1.1.20", "over": ["pc"] }
  ]
}
```

- 2 to 5 actors, 1 to 14 messages. `kind` picks an icon (see topology kinds) and may be left out.
- A message with `from` equal to `to` is a step the actor takes itself.
- `note` entries sit over one actor or span several (`over` lists actor ids).
- Labels at most about 28 characters, details about 36. Longer text wraps to two lines.

### topology

A network drawing: devices on a small grid, links with interface and address labels, shaded
zones such as VLANs or sites, and callouts.

```json
{
  "type": "topology",
  "nodes": [
    { "id": "r1", "kind": "router", "label": "R1", "x": 1, "y": 0 },
    { "id": "sw1", "kind": "switch", "label": "SW1", "x": 1, "y": 1 },
    { "id": "pc1", "kind": "pc", "label": "PC1", "sub": "10.1.10.11", "x": 0, "y": 2 },
    { "id": "pc2", "kind": "pc", "label": "PC2", "sub": "10.1.20.12", "x": 2, "y": 2 }
  ],
  "links": [
    { "from": "r1", "to": "sw1", "label": "802.1Q trunk", "fromLabel": "G0/0", "toLabel": "G0/1" },
    { "from": "sw1", "to": "pc1", "fromLabel": "G0/2" },
    { "from": "sw1", "to": "pc2", "fromLabel": "G0/3", "style": "dashed" }
  ],
  "zones": [{ "label": "VLAN 10", "nodes": ["pc1"], "tone": "accent" }],
  "marks": [{ "at": "r1", "text": "Router on a stick", "tone": "warn" }]
}
```

- Node kinds: `router`, `switch`, `l3switch`, `firewall`, `server`, `pc`, `laptop`, `phone`,
  `printer`, `ap`, `wlc`, `cloud`, `internet`, `db`, `host`.
- `x` and `y` are grid cells counted from 0. Use at most 3 columns (`x` 0 to 2) so the drawing
  stays readable on a phone; 4 is the hard limit. Rows can go deeper. Leave empty cells to space
  things out. Up to 12 nodes.
- Link `style`: `solid` (default), `dashed`, `wireless`, `serial`. `tone` colors a link
  (for example the blocked STP link `bad`, the chosen path `good`).
- `zones` shade a group of nodes. `marks` attach a callout to a node id, or to a link with
  `"at": "link:0"` (the link index).
- Labels short: `label` up to 10 characters, `sub` up to 16, link labels up to 14.

### tree

Hierarchies: DNS, file systems, recursion and call trees, binary trees, class hierarchies.

```json
{
  "type": "tree",
  "root": {
    "label": "AI",
    "children": [
      { "label": "Machine learning", "sub": "learns from data", "children": [{ "label": "Deep learning" }] }
    ]
  }
}
```

- Up to 5 levels and 24 nodes. A node has `label`, optional `sub`, `tone` and `children`.
- Drawn as a tree when it fits the screen and as an indented outline when it does not, so it
  always reads on a phone. `"layout": "outline"` forces the outline.

### fields

Header and frame layouts: Ethernet frame, 802.1Q tag, IPv4, IPv6, TCP and UDP headers.

```json
{
  "type": "fields",
  "unit": "bits",
  "width": 32,
  "rows": [
    [{ "label": "Version", "size": 4 }, { "label": "IHL", "size": 4 }, { "label": "DSCP / ECN", "size": 8 }, { "label": "Total length", "size": 16 }],
    [{ "label": "Source port", "size": 16 }, { "label": "Destination port", "size": 16, "tone": "accent" }]
  ]
}
```

- `unit`: `bits` or `bytes`. With `width` set, each row should add up to it; without it,
  sizes are proportional within each row.
- `size` is a number, or text for variable fields (`"46-1500"`), which then takes a share set by
  `weight` (default 2).
- Proportional boxes on wide screens; on a phone it becomes a list of fields with their sizes,
  grouped by row.

### bits

Binary views of addresses and masks: subnetting, wildcard masks, network and host bits.

```json
{
  "type": "bits",
  "prefix": 26,
  "octets": [3],
  "rows": [
    { "label": "Address", "value": "192.168.10.77" },
    { "label": "Mask", "value": "255.255.255.192" },
    { "label": "Network", "value": "192.168.10.64", "tone": "good" }
  ]
}
```

- `value` is a dotted IPv4 value; the app converts it to binary. Or give `bits` directly
  (`"0010 0000"`) for a single byte or any bit string, with an optional `value` shown beside it.
- `prefix` colors network bits and host bits differently. `octets` limits the binary view to
  those octets (0 to 3); the others show as decimal. Default: all four.
- Phones show two octets per line.

### cells

Data structures: arrays with indexes and pointers, linked lists, stacks, queues, hash buckets.

```json
{
  "type": "cells",
  "style": "array",
  "rows": [
    { "label": "nums", "cells": [1, 3, 4, 7, 9], "index": true, "pointers": [{ "at": 0, "label": "L" }, { "at": 4, "label": "R", "tone": "accent" }], "tones": { "2": "good" } }
  ]
}
```

- `style`: `array` (boxes with optional indexes and pointers), `list` (boxes joined by arrows,
  ending in null), `stack` (vertical, top marked), `queue` (front and back marked), `hash` (each
  row is a bucket: `label` is the bucket, `cells` its chain).
- Up to 12 cells per row and 8 rows. `tones` maps a cell index to a tone.

## Writing with visuals

- One idea per visual. A small diagram beside the right paragraph beats a big one at the end.
- A visual replaces words, it does not repeat them: if a table lists the ports, the paragraph
  does not.
- Keep labels short. Long text belongs in the body or `detail` lines.
- Every fact a question in the pack tests must be in the body, a visual, the code block or the
  key idea, not only in `deeper`.
