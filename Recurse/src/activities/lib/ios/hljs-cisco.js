// highlight.js language definition for Cisco IOS configuration and show output.
// Not registered here: CodeBlock registers it, for example
//   import { cisco } from '../activities/lib/ios/hljs-cisco.js'
//   hljs.registerLanguage('cisco', cisco)
// Aliases: ios, cisco-ios.

const KEYWORDS = [
  'aaa', 'access-class', 'access-group', 'access-list', 'active', 'address', 'allowed', 'area', 'auto', 'auto-cost',
  'banner', 'bandwidth', 'bpdufilter', 'bpduguard', 'cdp', 'channel-group', 'clock', 'community', 'configure', 'console',
  'copy', 'crypto', 'default', 'default-gateway', 'default-information', 'default-router', 'deny', 'description', 'desirable',
  'dhcp', 'disable', 'dns-server', 'do', 'domain-lookup', 'domain-name', 'dot1q', 'duplex', 'dynamic', 'enable',
  'encapsulation', 'end', 'eq', 'established', 'excluded-address', 'exec-timeout', 'exit', 'extended', 'generate', 'gt',
  'helper-address', 'host', 'hostname', 'inside', 'interface', 'ip', 'ipv6', 'key', 'lease', 'line', 'list', 'lldp',
  'logging', 'login', 'lt', 'master', 'maximum', 'mode', 'modulus', 'motd', 'name', 'name-server', 'nat', 'native',
  'neq', 'network', 'no', 'ntp', 'ospf', 'outside', 'overload', 'passive', 'passive-interface', 'password',
  'password-encryption', 'permit', 'ping', 'pool', 'port-security', 'portfast', 'preempt', 'priority', 'privilege',
  'range', 'reload', 'remark', 'remove', 'root', 'route', 'router', 'router-id', 'routing', 'rsa', 'run', 'secret',
  'server', 'service', 'show', 'shutdown', 'snmp-server', 'snooping', 'source', 'spanning-tree', 'speed', 'ssh',
  'standard', 'standby', 'static', 'sticky', 'switchport', 'terminal', 'transport', 'trap', 'traceroute', 'trunk',
  'trust', 'unicast-routing', 'username', 'version', 'violation', 'vlan', 'vty', 'write'
]

const LITERALS = ['any', 'access', 'brief', 'running-config', 'startup-config', 'up', 'down', 'administratively', 'FULL', 'Active', 'Standby', 'trunking', 'connected', 'notconnect', 'disabled']

const BUILT_INS = ['tcp', 'udp', 'icmp', 'ospf', 'eigrp', 'gre', 'esp', 'ahp', 'www', 'telnet', 'ftp', 'smtp', 'domain', 'bootps', 'bootpc', 'tftp', 'snmp', 'ntp', 'syslog', 'lacp', 'pagp']

/** @param {import('highlight.js').HLJSApi} hljs */
export function cisco(hljs) {
  const IPV4 = {
    className: 'literal',
    begin: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?:\/\d{1,2})?\b/,
    relevance: 0
  }
  const IPV6 = {
    className: 'literal',
    variants: [
      { begin: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(?:\/\d{1,3})?/ },
      { begin: /(?:\b[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?(?:\/\d{1,3})?/ }
    ],
    relevance: 0
  }
  const MAC = { className: 'literal', begin: /\b[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\b/, relevance: 0 }
  const INTERFACE = {
    className: 'literal',
    begin: /\b(?:(?:Ten)?GigabitEthernet|FastEthernet|Ethernet|Serial|Loopback|Vlan|Port-channel|Tunnel|Null|Gig|Gi|Fa|Te|Se|Lo|Vl|Po|Et)\s?\d+(?:\/\d+)*(?:\.\d+)?\b/,
    relevance: 2
  }
  const PROMPT = { className: 'meta', begin: /^[A-Za-z][\w.-]*(?:\([\w-]+\))?[>#]/, relevance: 10 }
  const COMMENT = hljs.COMMENT(/^\s*!/, /$/, { relevance: 0 })
  const MESSAGE = { className: 'title', begin: /^\s*% .*$/, relevance: 5 }
  const MNEMONIC = { className: 'symbol', begin: /%[A-Z0-9_]+-\d-[A-Z0-9_]+:?/, relevance: 5 }
  const SYSLOG = { className: 'meta', begin: /^\*?[A-Z][a-z]{2}\s+\d+ \d\d:\d\d:\d\d(?:\.\d+)?:/, relevance: 5 }
  const CARET = { className: 'deletion', begin: /^\s+\^\s*$/, relevance: 0 }
  const BANNER = { className: 'string', begin: /\^C/, end: /\^C/, relevance: 2 }
  const NUMBER = { className: 'number', begin: /\b\d+\b/, relevance: 0 }

  return {
    name: 'Cisco IOS',
    aliases: ['ios', 'cisco-ios'],
    case_insensitive: true,
    keywords: {
      $pattern: /[a-zA-Z][\w-]*/,
      keyword: KEYWORDS,
      literal: LITERALS,
      built_in: BUILT_INS
    },
    contains: [PROMPT, SYSLOG, COMMENT, MESSAGE, MNEMONIC, CARET, BANNER, INTERFACE, MAC, IPV6, IPV4, NUMBER]
  }
}

export default cisco
