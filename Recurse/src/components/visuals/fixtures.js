// Sample specs for every visual type: the dev gallery (/dev/visuals) draws them at phone and
// desktop widths, and the tests render and validate each one. Include the awkward cases too
// (long labels, the largest allowed sizes), since content will hit them.

export const VISUAL_FIXTURES = [
  {
    name: 'table: complexity, cards on phones',
    spec: {
      type: 'table',
      title: 'Sorting compared',
      columns: ['Algorithm', 'Best', 'Average', 'Worst', 'Extra space', 'Stable'],
      rows: [
        ['Bubble sort', 'O(n)', 'O(n^2)', 'O(n^2)', 'O(1)', 'yes'],
        ['Insertion sort', 'O(n)', 'O(n^2)', 'O(n^2)', 'O(1)', 'yes'],
        ['Merge sort', 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(n)', 'yes'],
        ['Quicksort', 'O(n log n)', 'O(n log n)', 'O(n^2)', 'O(log n)', 'no']
      ],
      mono: [1, 2, 3, 4],
      highlight: [2],
      caption: "Bubble sort's O(n) best case assumes the early exit."
    }
  },
  {
    name: 'table: three columns stay a table',
    spec: {
      type: 'table',
      columns: ['Port', 'Transport', 'Service'],
      rows: [
        ['22', 'TCP', 'SSH'],
        ['53', 'UDP, TCP', 'DNS: queries over UDP, zone transfers over TCP'],
        ['67, 68', 'UDP', 'DHCP server, client'],
        ['443', 'TCP', '**HTTPS**']
      ],
      mono: [0]
    }
  },
  {
    name: 'compare',
    spec: {
      type: 'compare',
      title: 'TCP or UDP',
      items: [
        { title: 'TCP', sub: 'Reliable byte stream', tone: 'accent', points: ['Three-way handshake before data', 'Sequence numbers and acknowledgments', 'Retransmits lost segments', 'Windowing for flow control'] },
        { title: 'UDP', sub: 'Fire and forget', points: ['No connection setup', 'No retransmission: the app decides', 'Small 8-byte header', 'Voice, video, DNS queries'] }
      ]
    }
  },
  {
    name: 'compare: three items',
    spec: {
      type: 'compare',
      items: [
        { title: 'Access port', points: ['One data VLAN', 'Untagged frames'] },
        { title: 'Trunk port', tone: 'accent', points: ['Many VLANs', '802.1Q tags', 'Native VLAN untagged'] },
        { title: 'Routed port', tone: 'muted', points: ['No VLAN', 'Has an IP address'] }
      ]
    }
  },
  {
    name: 'steps: wildcard math',
    spec: {
      type: 'steps',
      title: 'Wildcard for 172.16.32.0/20',
      steps: [
        { label: 'Write the subnet mask', work: '/20 = 255.255.240.0' },
        { label: 'Subtract each octet from 255', work: '255 - 255 = 0\n255 - 240 = 15\n255 - 0 = 255', note: 'the first octet works the same way' },
        { label: 'Pair it with the network address', work: '172.16.32.0 0.0.15.255' }
      ],
      result: 'Matches `172.16.32.0` through `172.16.47.255`'
    }
  },
  {
    name: 'flow: decision with yes and no',
    spec: {
      type: 'flow',
      title: 'How a router reads an ACL',
      steps: [
        { label: 'A packet arrives on an interface with an ACL in that direction' },
        { label: 'Does the next line match?', yes: 'Take its action (permit or deny) and stop', no: 'Move to the line after it' },
        { label: 'No line matched', detail: 'The implicit deny any drops the packet. No counter, no log.', tone: 'bad' }
      ]
    }
  },
  {
    name: 'flow: cycle across',
    spec: {
      type: 'flow',
      direction: 'across',
      steps: [{ label: 'Collect data' }, { label: 'Clean and label' }, { label: 'Train' }, { label: 'Validate' }, { label: 'Deploy' }],
      loop: 'Retrain when accuracy drifts'
    }
  },
  {
    name: 'stack: OSI with TCP/IP groups',
    spec: {
      type: 'stack',
      title: 'OSI and TCP/IP',
      layers: [
        { label: 'Application', tag: '7', detail: 'HTTP, DNS, SSH' },
        { label: 'Presentation', tag: '6', detail: 'Formats, encryption' },
        { label: 'Session', tag: '5', detail: 'Conversations' },
        { label: 'Transport', tag: '4', detail: 'TCP, UDP: ports', tone: 'accent' },
        { label: 'Network', tag: '3', detail: 'IP addresses, routers' },
        { label: 'Data Link', tag: '2', detail: 'MAC addresses, switches' },
        { label: 'Physical', tag: '1', detail: 'Bits on a cable or radio' }
      ],
      groups: [{ label: 'TCP/IP Application', from: 0, to: 2 }],
      arrow: 'down',
      arrowLabel: 'Sending: each layer adds its header'
    }
  },
  {
    name: 'bars: growth on a log scale',
    spec: {
      type: 'bars',
      title: 'Steps for n = 1,000,000',
      scale: 'log',
      items: [
        { label: 'O(1)', value: 1 },
        { label: 'O(log n)', value: 20 },
        { label: 'O(n)', value: 1e6, display: '1,000,000' },
        { label: 'O(n log n)', value: 2e7, display: '20,000,000' },
        { label: 'O(n^2)', value: 1e12, display: '10^12', tone: 'bad' }
      ]
    }
  },
  {
    name: 'bars: utilization, linear',
    spec: {
      type: 'bars',
      unit: '%',
      items: [
        { label: 'Month 6', value: 63 },
        { label: 'Month 8', value: 68 },
        { label: 'Month 10 (forecast)', value: 72.5, tone: 'warn' },
        { label: 'Month 12 (forecast)', value: 77.1, tone: 'warn' }
      ]
    }
  },
  {
    name: 'sequence: DHCP DORA',
    spec: {
      type: 'sequence',
      title: 'DHCP: Discover, Offer, Request, Acknowledge',
      actors: [
        { id: 'pc', label: 'PC', kind: 'pc' },
        { id: 'srv', label: 'DHCP server', kind: 'server' }
      ],
      messages: [
        { from: 'pc', to: 'srv', label: 'Discover', detail: 'broadcast, source 0.0.0.0', tone: 'accent' },
        { from: 'srv', to: 'pc', label: 'Offer', detail: '10.1.1.20 for 24 hours', dashed: true },
        { from: 'pc', to: 'srv', label: 'Request', detail: 'broadcast: I take 10.1.1.20', tone: 'accent' },
        { from: 'srv', to: 'pc', label: 'Acknowledge', dashed: true },
        { note: 'The PC uses 10.1.1.20 and renews at half the lease', over: ['pc'] }
      ]
    }
  },
  {
    name: 'sequence: four actors with a self step',
    spec: {
      type: 'sequence',
      actors: [
        { id: 'pc', label: 'PC', kind: 'pc' },
        { id: 'sw', label: 'Switch', kind: 'switch' },
        { id: 'r', label: 'Router', kind: 'router' },
        { id: 'web', label: 'Web server', kind: 'server' }
      ],
      messages: [
        { from: 'pc', to: 'pc', label: 'Is 8.8.8.8 local?', detail: 'no: send to the gateway' },
        { from: 'pc', to: 'r', label: 'ARP: who has 10.1.1.1?', tone: 'accent' },
        { from: 'r', to: 'pc', label: 'ARP reply', detail: 'MAC 0011.2233.4455', dashed: true },
        { from: 'pc', to: 'web', label: 'TCP SYN to port 443' },
        { note: 'The switch forwards both frames by MAC address', over: ['pc', 'sw', 'r'] }
      ]
    }
  },
  {
    name: 'topology: router on a stick',
    spec: {
      type: 'topology',
      title: 'Router on a stick',
      nodes: [
        { id: 'r1', kind: 'router', label: 'R1', x: 1, y: 0 },
        { id: 'sw1', kind: 'switch', label: 'SW1', x: 1, y: 1 },
        { id: 'pc1', kind: 'pc', label: 'PC1', sub: '10.1.10.11', x: 0, y: 2 },
        { id: 'pc2', kind: 'pc', label: 'PC2', sub: '10.1.20.12', x: 2, y: 2 }
      ],
      links: [
        { from: 'r1', to: 'sw1', label: '802.1Q trunk', fromLabel: 'G0/0', toLabel: 'G0/1', tone: 'accent' },
        { from: 'sw1', to: 'pc1', fromLabel: 'G0/2' },
        { from: 'sw1', to: 'pc2', fromLabel: 'G0/3' }
      ],
      zones: [
        { label: 'VLAN 10', nodes: ['pc1'], tone: 'accent' },
        { label: 'VLAN 20', nodes: ['pc2'], tone: 'good' }
      ],
      marks: [{ at: 'r1', text: 'G0/0.10 and G0/0.20', tone: 'warn' }]
    }
  },
  {
    name: 'topology: ACL placement in a row of routers',
    spec: {
      type: 'topology',
      nodes: [
        { id: 'a', kind: 'host', label: 'Host A', sub: '10.1.1.0/24', x: 0, y: 0 },
        { id: 'r1', kind: 'router', label: 'R1', x: 0, y: 1 },
        { id: 'r2', kind: 'router', label: 'R2', x: 1, y: 1 },
        { id: 'r3', kind: 'router', label: 'R3', x: 2, y: 1 },
        { id: 'srv', kind: 'server', label: 'Servers', sub: '10.3.3.0/24', x: 2, y: 0 },
        { id: 'net', kind: 'internet', label: 'Internet', x: 1, y: 2 },
        { id: 'ap', kind: 'ap', label: 'AP1', x: 0, y: 2 },
        { id: 'fw', kind: 'firewall', label: 'FW', x: 2, y: 2 }
      ],
      links: [
        { from: 'a', to: 'r1', toLabel: 'G0/0' },
        { from: 'r1', to: 'r2', fromLabel: 'G0/1', toLabel: 'G0/0', style: 'serial' },
        { from: 'r2', to: 'r3', fromLabel: 'G0/1', toLabel: 'G0/0' },
        { from: 'r3', to: 'srv', fromLabel: 'G0/1' },
        { from: 'r2', to: 'net', style: 'dashed' },
        { from: 'r1', to: 'ap', style: 'wireless' },
        { from: 'r3', to: 'fw', tone: 'bad' }
      ],
      marks: [
        { at: 'r1', text: 'Extended ACL in', tone: 'good' },
        { at: 'link:3', text: 'Standard ACL out', tone: 'warn' }
      ]
    }
  },
  {
    name: 'tree: AI family',
    spec: {
      type: 'tree',
      root: {
        label: 'AI',
        children: [
          {
            label: 'Machine learning',
            sub: 'learns from data',
            children: [
              { label: 'Classic ML', sub: 'clustering, regression' },
              { label: 'Deep learning', sub: 'many-layer networks', children: [{ label: 'Generative models', sub: 'including LLMs', tone: 'accent' }] }
            ]
          },
          { label: 'Rule-based systems', sub: 'hand-written logic', tone: 'muted' }
        ]
      }
    }
  },
  {
    name: 'tree: merge sort split, wide',
    spec: {
      type: 'tree',
      title: 'Merge sort on n = 8',
      root: {
        label: '8',
        children: [
          { label: '4', children: [{ label: '2', children: [{ label: '1' }, { label: '1' }] }, { label: '2', children: [{ label: '1' }, { label: '1' }] }] },
          { label: '4', children: [{ label: '2', children: [{ label: '1' }, { label: '1' }] }, { label: '2', children: [{ label: '1' }, { label: '1' }] }] }
        ]
      },
      caption: '3 levels of merging, each costing n = 8, so n log n = 24'
    }
  },
  {
    name: 'fields: IPv4 header',
    spec: {
      type: 'fields',
      title: 'IPv4 header (20 bytes without options)',
      unit: 'bits',
      width: 32,
      rows: [
        [{ label: 'Version', size: 4 }, { label: 'IHL', size: 4 }, { label: 'DSCP / ECN', size: 8 }, { label: 'Total length', size: 16 }],
        [{ label: 'Identification', size: 16 }, { label: 'Flags', size: 3 }, { label: 'Fragment offset', size: 13 }],
        [{ label: 'TTL', size: 8, tone: 'warn' }, { label: 'Protocol', size: 8 }, { label: 'Header checksum', size: 16 }],
        [{ label: 'Source address', size: 32, tone: 'accent' }],
        [{ label: 'Destination address', size: 32, tone: 'accent' }]
      ]
    }
  },
  {
    name: 'fields: Ethernet frame in bytes',
    spec: {
      type: 'fields',
      unit: 'bytes',
      rows: [
        [
          { label: 'Preamble + SFD', size: 8, tone: 'muted' },
          { label: 'Destination MAC', size: 6, tone: 'accent' },
          { label: 'Source MAC', size: 6 },
          { label: 'Type', size: 2 },
          { label: 'Data', size: '46-1500', weight: 4 },
          { label: 'FCS', size: 4, note: 'CRC check' }
        ]
      ]
    }
  },
  {
    name: 'bits: subnet /26',
    spec: {
      type: 'bits',
      title: '192.168.10.77/26',
      prefix: 26,
      octets: [3],
      rows: [
        { label: 'Address', value: '192.168.10.77' },
        { label: 'Mask', value: '255.255.255.192' },
        { label: 'Network', value: '192.168.10.64', tone: 'good' },
        { label: 'Broadcast', value: '192.168.10.127', tone: 'warn' }
      ]
    }
  },
  {
    name: 'bits: full address and raw bits',
    spec: {
      type: 'bits',
      prefix: 20,
      rows: [
        { label: 'Address', value: '172.16.37.9' },
        { label: 'Wildcard', value: '0.0.15.255' },
        { label: 'Third octet', bits: '0010 0101', value: '37' }
      ]
    }
  },
  {
    name: 'cells: two pointers',
    spec: {
      type: 'cells',
      style: 'array',
      title: 'Pair that sums to 13',
      rows: [{ label: 'nums', cells: [1, 3, 4, 7, 9, 12], index: true, pointers: [{ at: 1, label: 'L' }, { at: 5, label: 'R', tone: 'accent' }], tones: { 1: 'good', 5: 'good' } }]
    }
  },
  {
    name: 'cells: linked list, stack, queue, hash',
    spec: {
      type: 'cells',
      style: 'list',
      rows: [{ label: 'head', cells: [3, 8, 12, 20], pointers: [{ at: 2, label: 'slow' }] }]
    }
  },
  { name: 'cells: stack', spec: { type: 'cells', style: 'stack', rows: [{ label: 'call stack', cells: ['main()', 'fact(3)', 'fact(2)', 'fact(1)'], tones: { 3: 'accent' } }] } },
  { name: 'cells: queue', spec: { type: 'cells', style: 'queue', rows: [{ label: 'BFS queue', cells: ['A', 'B', 'C', 'D'] }] } },
  {
    name: 'cells: hash buckets',
    spec: {
      type: 'cells',
      style: 'hash',
      rows: [
        { label: '0', cells: ['"cat": 3'] },
        { label: '1', cells: [] },
        { label: '2', cells: ['"dog": 1', '"owl": 7'], tones: { 1: 'warn' } },
        { label: '3', cells: ['"emu": 2'] }
      ],
      caption: 'Bucket 2 holds a collision: two keys chained together.'
    }
  }
]
