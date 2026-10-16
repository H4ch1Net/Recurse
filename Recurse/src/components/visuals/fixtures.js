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
  },

  // ---- Edge cases for the drawn types: the largest sizes and the longest text allowed. ----
  {
    name: 'sequence: five actors, long labels, notes across actors',
    spec: {
      type: 'sequence',
      title: '802.1X on a wireless LAN',
      actors: [
        { id: 'c', label: 'Wireless client', kind: 'laptop' },
        { id: 'ap', label: 'Lightweight AP', kind: 'ap' },
        { id: 'wlc', label: 'Controller', kind: 'wlc' },
        { id: 'aaa', label: 'RADIUS server', kind: 'server' },
        { id: 'dhcp', label: 'DHCP server', kind: 'server' }
      ],
      messages: [
        { from: 'c', to: 'ap', label: 'Associate to SSID **CORP**', tone: 'accent' },
        { from: 'ap', to: 'wlc', label: 'Forward in a CAPWAP tunnel', detail: 'UDP 5246 control, 5247 data', dashed: true },
        { note: 'The AP and controller act together as the 802.1X authenticator', over: ['ap', 'wlc'] },
        { from: 'wlc', to: 'c', label: 'EAP Request: identity please' },
        { from: 'c', to: 'wlc', label: 'EAP Response: `alice@corp`' },
        { from: 'wlc', to: 'aaa', label: 'RADIUS Access-Request with the EAP data', detail: 'shared secret protects the exchange', tone: 'accent' },
        { from: 'aaa', to: 'aaa', label: 'Check the credentials', detail: 'against Active Directory' },
        { from: 'aaa', to: 'wlc', label: 'RADIUS Access-Accept', tone: 'good', dashed: true },
        { from: 'wlc', to: 'c', label: 'EAP Success, then WPA3 4-way handshake', tone: 'good' },
        { from: 'c', to: 'dhcp', label: 'DHCP Discover', detail: 'broadcast, relayed by the controller' },
        { from: 'dhcp', to: 'c', label: 'DHCP Offer', dashed: true, tone: 'muted' },
        { from: 'c', to: 'c', label: 'Wrong password next time?', tone: 'bad' },
        { from: 'aaa', to: 'wlc', label: 'RADIUS Access-Reject', tone: 'bad', dashed: true },
        { note: 'Every device in the path sees the result, but only the client and the RADIUS server see the password', over: ['c', 'ap', 'wlc', 'aaa', 'dhcp'] }
      ]
    }
  },
  {
    name: 'sequence: fourteen messages, boxed actors',
    spec: {
      type: 'sequence',
      title: 'A TCP connection from start to finish',
      actors: [
        { id: 'c', label: 'Client' },
        { id: 's', label: 'Server' }
      ],
      messages: [
        { from: 'c', to: 's', label: '`SYN`', detail: 'seq = 100', tone: 'accent' },
        { from: 's', to: 'c', label: '`SYN-ACK`', detail: 'seq = 300, ack = 101', tone: 'accent', dashed: true },
        { from: 'c', to: 's', label: '`ACK`', detail: 'ack = 301', tone: 'accent' },
        { from: 'c', to: 's', label: 'Data, 100 bytes', detail: 'seq = 101' },
        { from: 's', to: 'c', label: '`ACK`', detail: 'ack = 201', dashed: true },
        { from: 'c', to: 's', label: 'Data, 100 bytes', detail: 'seq = 201, lost on the way', tone: 'bad' },
        { from: 'c', to: 'c', label: 'Retransmission timer expires', tone: 'warn' },
        { from: 'c', to: 's', label: 'Data again', detail: 'seq = 201', tone: 'warn' },
        { from: 's', to: 'c', label: '`ACK`', detail: 'ack = 301', dashed: true },
        { from: 'c', to: 's', label: '`FIN`', tone: 'muted' },
        { from: 's', to: 'c', label: '`ACK`', dashed: true, tone: 'muted' },
        { from: 's', to: 'c', label: '`FIN`', tone: 'muted' },
        { from: 'c', to: 's', label: '`ACK`', tone: 'muted' },
        { from: 'c', to: 'c', label: 'Wait twice the maximum segment lifetime, then close', detail: 'TIME_WAIT' }
      ]
    }
  },
  {
    name: 'topology: twelve nodes in four columns',
    spec: {
      type: 'topology',
      title: 'Campus with a wireless LAN',
      nodes: [
        { id: 'isp', kind: 'internet', label: 'Internet', x: 1, y: 0 },
        { id: 'saas', kind: 'cloud', label: 'SaaS cloud', sub: 'office apps', x: 3, y: 0 },
        { id: 'fw', kind: 'firewall', label: 'Edge FW', sub: '203.0.113.2/30', x: 1, y: 1, tone: 'warn' },
        { id: 'core', kind: 'l3switch', label: 'Core', sub: 'SVIs, OSPF area 0', x: 1, y: 2, tone: 'accent' },
        { id: 'wlc', kind: 'wlc', label: 'WLC1', sub: '10.0.99.5', x: 3, y: 2 },
        { id: 'dist', kind: 'switch', label: 'Access SW', x: 1, y: 3 },
        { id: 'srv', kind: 'server', label: 'Files', sub: '10.0.50.10', x: 0, y: 2 },
        { id: 'db', kind: 'db', label: 'Database', sub: '10.0.50.20', x: 0, y: 3 },
        { id: 'ap', kind: 'ap', label: 'AP-Lobby', x: 2, y: 4 },
        { id: 'phone', kind: 'phone', label: 'Phone', sub: 'voice VLAN 30', x: 0, y: 4 },
        { id: 'laptop', kind: 'laptop', label: 'Laptop', sub: '10.0.10.57', x: 3, y: 4, tone: 'good' },
        { id: 'prn', kind: 'printer', label: 'Printer', x: 1, y: 4, tone: 'muted' }
      ],
      links: [
        { from: 'isp', to: 'fw', label: 'ISP circuit', style: 'serial' },
        { from: 'fw', to: 'core', fromLabel: 'G0/1', toLabel: 'G1/0/1' },
        { from: 'core', to: 'srv', fromLabel: 'G1/0/2' },
        { from: 'core', to: 'wlc', fromLabel: 'G1/0/24', label: 'trunk', tone: 'accent' },
        { from: 'core', to: 'dist', label: '802.1Q trunk', tone: 'accent' },
        { from: 'srv', to: 'db', style: 'dashed', label: 'replication' },
        { from: 'dist', to: 'ap', toLabel: 'G0' },
        { from: 'dist', to: 'phone', fromLabel: 'Fa0/5' },
        { from: 'dist', to: 'prn' },
        { from: 'ap', to: 'laptop', style: 'wireless', tone: 'good' },
        { from: 'saas', to: 'isp', style: 'dashed' },
        { from: 'wlc', to: 'ap', style: 'dashed', label: 'CAPWAP', tone: 'muted' }
      ],
      zones: [
        { label: 'Server VLAN 50', nodes: ['srv', 'db'], tone: 'muted' },
        { label: 'Wireless', nodes: ['ap', 'laptop'], tone: 'good' },
        { label: 'Edge', nodes: ['fw'], tone: 'warn' }
      ],
      marks: [
        { at: 'core', text: 'Default gateway for every VLAN', tone: 'accent' },
        { at: 'link:9', text: 'WPA3 Enterprise', tone: 'good' },
        { at: 'fw', text: 'PAT to 203.0.113.2', tone: 'warn' }
      ]
    }
  },
  {
    name: 'topology: STP triangle with a blocked link',
    spec: {
      type: 'topology',
      nodes: [
        { id: 'sw1', kind: 'switch', label: 'SW1', sub: 'root bridge', x: 1, y: 0, tone: 'good' },
        { id: 'sw2', kind: 'switch', label: 'SW2', x: 0, y: 1 },
        { id: 'sw3', kind: 'switch', label: 'SW3', x: 2, y: 1 }
      ],
      links: [
        { from: 'sw1', to: 'sw2', fromLabel: 'G0/1', toLabel: 'G0/1', label: 'cost 4', tone: 'good' },
        { from: 'sw1', to: 'sw3', fromLabel: 'G0/2', toLabel: 'G0/1', label: 'cost 4', tone: 'good' },
        { from: 'sw2', to: 'sw3', fromLabel: 'G0/2', toLabel: 'G0/2', label: 'cost 19', tone: 'bad', style: 'dashed' }
      ],
      marks: [{ at: 'link:2', text: 'SW3 G0/2 blocks', tone: 'bad' }]
    }
  },
  {
    name: 'topology: VLANs across two switches',
    spec: {
      type: 'topology',
      nodes: [
        { id: 'pc1', kind: 'pc', label: 'PC1', x: 0, y: 0 },
        { id: 'pc3', kind: 'pc', label: 'PC3', x: 2, y: 0 },
        { id: 'sw1', kind: 'switch', label: 'SW1', x: 0, y: 1 },
        { id: 'sw2', kind: 'switch', label: 'SW2', x: 2, y: 1 },
        { id: 'pc2', kind: 'pc', label: 'PC2', x: 0, y: 2 },
        { id: 'pc4', kind: 'pc', label: 'PC4', x: 2, y: 2 }
      ],
      links: [
        { from: 'sw1', to: 'sw2', label: '802.1Q trunk', tone: 'accent' },
        { from: 'sw1', to: 'pc1', fromLabel: 'Gi0/1' },
        { from: 'sw1', to: 'pc2', fromLabel: 'Gi0/2' },
        { from: 'sw2', to: 'pc3', fromLabel: 'Gi0/1' },
        { from: 'sw2', to: 'pc4', fromLabel: 'Gi0/2' }
      ],
      zones: [
        { label: 'VLAN 10', nodes: ['pc1', 'pc3'], tone: 'accent' },
        { label: 'VLAN 20', nodes: ['pc2', 'pc4'], tone: 'good' }
      ]
    }
  },
  {
    name: 'topology: vertical chain with a side branch',
    spec: {
      type: 'topology',
      nodes: [
        { id: 'r1', kind: 'router', label: 'R1', sub: '10.1.1.1/24', x: 1, y: 0 },
        { id: 'sw1', kind: 'switch', label: 'SW1', sub: 'VLAN 10', x: 1, y: 1 },
        { id: 'pc1', kind: 'pc', label: 'PC1', sub: '10.1.1.10', x: 1, y: 2 },
        { id: 'srv', kind: 'server', label: 'Server', sub: '10.1.1.50', x: 2, y: 1 }
      ],
      links: [
        { from: 'r1', to: 'sw1', fromLabel: 'G0/0', toLabel: 'G0/1' },
        { from: 'sw1', to: 'pc1', fromLabel: 'G0/2' },
        { from: 'sw1', to: 'srv', fromLabel: 'G0/3' }
      ]
    }
  },
  {
    name: 'topology: weighted graph of six vertices',
    spec: {
      type: 'topology',
      title: "Dijkstra's shortest paths from A",
      nodes: [
        { id: 'a', kind: 'vertex', label: 'A', sub: 'd = 0', x: 0, y: 0, tone: 'accent' },
        { id: 'b', kind: 'vertex', label: 'B', sub: 'd = 4', x: 1, y: 0 },
        { id: 'c', kind: 'vertex', label: 'C', sub: 'd = 7', x: 2, y: 0 },
        { id: 'd', kind: 'vertex', label: 'D', sub: 'd = 1', x: 0, y: 1, tone: 'good' },
        { id: 'e', kind: 'vertex', label: 'E', sub: 'd = 6', x: 1, y: 1, tone: 'good' },
        { id: 'f', kind: 'vertex', label: 'F', sub: 'd = 7', x: 2, y: 1 }
      ],
      links: [
        { from: 'a', to: 'b', label: '4' },
        { from: 'a', to: 'd', label: '1', tone: 'good' },
        { from: 'b', to: 'c', label: '3' },
        { from: 'b', to: 'e', label: '2' },
        { from: 'd', to: 'e', label: '5', tone: 'good' },
        { from: 'e', to: 'f', label: '1', tone: 'good' },
        { from: 'c', to: 'f', label: '6' },
        { from: 'a', to: 'e', label: '7', style: 'dashed', tone: 'muted' }
      ],
      marks: [{ at: 'f', text: 'Shortest path A, D, E, F', tone: 'good' }]
    }
  },
  {
    name: 'topology: one column',
    spec: {
      type: 'topology',
      nodes: [
        { id: 'net', kind: 'cloud', label: 'WAN', x: 0, y: 0 },
        { id: 'r', kind: 'router', label: 'Branch R1', sub: '198.51.100.9', x: 0, y: 1 },
        { id: 'pc', kind: 'host', label: 'Host', sub: 'DHCP client', x: 0, y: 2 }
      ],
      links: [
        { from: 'net', to: 'r', style: 'serial', toLabel: 'S0/0/0' },
        { from: 'r', to: 'pc', fromLabel: 'G0/0', toLabel: 'eth0' }
      ],
      marks: [{ at: 'r', text: 'NAT inside and outside', tone: 'accent' }]
    }
  },
  {
    name: 'tree: 24 nodes over five levels',
    spec: {
      type: 'tree',
      title: 'The DNS hierarchy',
      root: {
        label: '.',
        sub: 'root',
        children: [
          {
            label: 'com',
            children: [
              { label: 'example.com', children: [{ label: 'www', tone: 'accent' }, { label: 'mail' }, { label: 'dev', children: [{ label: 'api' }, { label: 'ci' }] }] },
              { label: 'cisco.com', children: [{ label: 'www' }, { label: 'learn' }, { label: 'developer' }] }
            ]
          },
          { label: 'org', children: [{ label: 'ietf.org', children: [{ label: 'datatracker' }, { label: 'www' }] }, { label: 'wikipedia.org', children: [{ label: 'en' }] }] },
          { label: 'net', children: [{ label: 'akamai.net', tone: 'muted', children: [{ label: 'e1' }] }] },
          { label: 'uk', sub: 'country code', children: [{ label: 'co.uk', children: [{ label: 'bbc.co.uk' }] }] }
        ]
      }
    }
  },
  {
    name: 'tree: forced outline with markup',
    spec: {
      type: 'tree',
      layout: 'outline',
      root: {
        label: '`/`',
        children: [
          { label: '`etc/`', sub: 'configuration', children: [{ label: '`hosts`' }, { label: '`resolv.conf`', sub: '**DNS servers**', tone: 'accent' }] },
          { label: '`home/`', children: [{ label: '`sam/`', children: [{ label: '`notes.md`' }] }] },
          { label: '`var/log/`', sub: 'system logs', tone: 'warn' }
        ]
      }
    }
  },
  {
    name: 'fields: TCP header with options',
    spec: {
      type: 'fields',
      title: 'TCP header',
      unit: 'bits',
      width: 32,
      rows: [
        [{ label: 'Source port', size: 16 }, { label: 'Destination port', size: 16, tone: 'accent' }],
        [{ label: 'Sequence number', size: 32 }],
        [{ label: 'Acknowledgment number', size: 32 }],
        [{ label: 'Data offset', size: 4 }, { label: 'Reserved', size: 3, tone: 'muted' }, { label: 'Flags', size: 9, note: 'SYN, ACK, FIN, RST' }, { label: 'Window size', size: 16, tone: 'good' }],
        [{ label: 'Checksum', size: 16 }, { label: 'Urgent pointer', size: 16 }],
        [{ label: 'Options', size: '0-320', note: 'MSS, window scale, SACK', tone: 'muted' }]
      ]
    }
  },
  {
    name: 'fields: 802.1Q tag with a one-bit field',
    spec: {
      type: 'fields',
      title: '802.1Q tag',
      unit: 'bits',
      width: 32,
      rows: [[{ label: 'TPID', size: 16, note: '0x8100' }, { label: 'PCP', size: 3, note: 'priority' }, { label: 'DEI', size: 1 }, { label: 'VLAN ID', size: 12, tone: 'accent' }]]
    }
  },
  {
    name: 'fields: eight one-bit flags',
    spec: {
      type: 'fields',
      unit: 'bits',
      width: 8,
      rows: [[
        { label: 'CWR', size: 1 }, { label: 'ECE', size: 1 }, { label: 'URG', size: 1 }, { label: 'ACK', size: 1, tone: 'accent' },
        { label: 'PSH', size: 1 }, { label: 'RST', size: 1, tone: 'bad' }, { label: 'SYN', size: 1, tone: 'accent' }, { label: 'FIN', size: 1 }
      ]]
    }
  },
  {
    name: 'bits: eight full rows, /27',
    spec: {
      type: 'bits',
      title: '10.20.30.77/27',
      prefix: 27,
      rows: [
        { label: 'Address', value: '10.20.30.77' },
        { label: 'Mask', value: '255.255.255.224' },
        { label: 'Wildcard', value: '0.0.0.31', tone: 'muted' },
        { label: 'Network', value: '10.20.30.64', tone: 'good' },
        { label: 'First host', value: '10.20.30.65' },
        { label: 'Last host', value: '10.20.30.94' },
        { label: 'Broadcast address', value: '10.20.30.95', tone: 'warn' },
        { label: 'Same, raw', bits: '00001010000101000001111001011111', tone: 'bad' }
      ]
    }
  },
  {
    name: 'bits: raw bytes without a prefix',
    spec: {
      type: 'bits',
      rows: [
        { label: '192', bits: '11000000', value: '128 + 64' },
        { label: '168', bits: '1010 1000', value: '128 + 32 + 8', tone: 'accent' },
        { label: 'Nibbles', bits: '1111 0000 1010 0101 0011 1100' }
      ]
    }
  },
  {
    name: 'cells: twelve cells, shared pointers',
    spec: {
      type: 'cells',
      style: 'array',
      title: 'Binary search for 47',
      rows: [
        {
          label: 'sorted',
          cells: [2, 5, 8, 12, 16, 23, 38, 47, 56, 72, 91, 104],
          index: true,
          pointers: [{ at: 0, label: 'lo' }, { at: 5, label: 'mid', tone: 'accent' }, { at: 11, label: 'hi' }, { at: 7, label: 'target', tone: 'good' }, { at: 7, label: 'next mid', tone: 'warn' }],
          tones: { 5: 'accent', 7: 'good', 0: 'muted', 1: 'muted', 2: 'muted', 3: 'muted', 4: 'muted' }
        },
        { label: 'words', cells: ['"apple"', '"banana"', '"cherry"', '"dragonfruit"', '"elderberry"', '"fig"'], index: true }
      ]
    }
  },
  {
    name: 'cells: wide pointer labels',
    spec: {
      type: 'cells',
      style: 'array',
      title: 'Move zeros to the end',
      rows: [
        {
          label: 'nums',
          cells: [1, 3, 12, 0, 0, 5, 7],
          index: true,
          pointers: [
            { at: 0, label: 'start' },
            { at: 2, label: 'write = 3', tone: 'accent' },
            { at: 3, label: 'read = 4' },
            { at: 5, label: 'lo, mid, hi', tone: 'warn' },
            { at: 5, label: 'target', tone: 'good' },
            { at: 6, label: 'last index of the array' }
          ],
          tones: { 2: 'accent', 5: 'warn' }
        }
      ]
    }
  },
  {
    name: 'cells: list of twelve nodes',
    spec: {
      type: 'cells',
      style: 'list',
      rows: [
        { label: 'head', cells: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], pointers: [{ at: 5, label: 'slow' }, { at: 11, label: 'fast', tone: 'accent' }], tones: { 5: 'accent' } },
        { cells: ['A'] }
      ]
    }
  },
  {
    name: 'cells: queue of twelve',
    spec: { type: 'cells', style: 'queue', rows: [{ label: 'print jobs', cells: ['job1', 'job2', 'job3', 'job4', 'job5', 'job6', 'job7', 'job8', 'job9', 'job10', 'job11', 'job12'], tones: { 0: 'accent' } }] }
  },
  {
    name: 'cells: two stacks side by side',
    spec: {
      type: 'cells',
      style: 'stack',
      title: 'A queue from two stacks',
      rows: [
        { label: 'inbox', cells: ['4', '5', '6'], tones: { 2: 'accent' } },
        { label: 'outbox', cells: ['3', '2', '1'], tones: { 2: 'good' } },
        { label: 'spare', cells: [] }
      ]
    }
  },
  {
    name: 'cells: eight hash buckets with a long chain',
    spec: {
      type: 'cells',
      style: 'hash',
      rows: [
        { label: '0', cells: [] },
        { label: '1', cells: ['10.1.1.1 -> 0011.2233.4455'] },
        { label: '2', cells: [] },
        { label: '3', cells: ['k3', 'k11', 'k19', 'k27', 'k35', 'k43'], tones: { 5: 'bad' } },
        { label: '4', cells: ['k4'] },
        { label: '5', cells: [] },
        { label: '6', cells: ['k6', 'k14'] },
        { label: '7', cells: ['k7'], pointers: [{ at: 0, label: 'newest' }] }
      ]
    }
  }
]
