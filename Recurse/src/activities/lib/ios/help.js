// Help for the IOS simulator: formatting of the `?` context help (the grammar in sim.js
// supplies the entries), friendly names for each CLI mode, and plain-language
// explanations of common commands for the lab panel and solution steps.

/** Friendly names for the prompt modes, shown next to the terminal. */
export const MODE_LABELS = {
  user: 'User EXEC',
  enable: 'Privileged EXEC',
  config: 'Global config',
  if: 'Interface config',
  'if-range': 'Interface range config',
  subif: 'Subinterface config',
  vlan: 'VLAN config',
  line: 'Line config',
  router: 'OSPF router config',
  dhcp: 'DHCP pool config',
  'std-nacl': 'Standard ACL config',
  'ext-nacl': 'Extended ACL config'
}

/**
 * Format `?` help entries the way IOS does: two spaces, the keyword padded to the
 * longest one, then the description. entries: [{ word, help }]
 */
export function formatHelpList(entries) {
  if (!entries.length) return []
  const width = Math.max(...entries.map((e) => e.word.length))
  return entries.map((e) => (e.help ? `  ${e.word.padEnd(width)}  ${e.help}` : `  ${e.word}`))
}

/** Partial-word help ("sh?"): matching words on one line, wrapped near 80 columns. */
export function formatPartialHelp(words) {
  const lines = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line}  ${w}` : w
    if (next.length > 78 && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

// ---------- plain-language explanations ----------

// More specific patterns must come before more general ones. Matched against the
// command with any prompt stripped, lower-cased, abbreviations expanded where common.
const RULES = [
  [/^en(a(b(le?)?)?)?$/, 'Enters privileged EXEC mode, the level needed to see full status and start configuring.'],
  [/^disable$/, 'Drops back from privileged EXEC to user EXEC mode.'],
  [/^conf(igure)?( t(erminal)?)?$/, 'Enters global configuration mode, where device-wide settings are changed.'],
  [/^hostname\b/, 'Sets the device name shown in the prompt.'],
  [/^int(erface)? range\b/, 'Selects several interfaces at once so one set of commands configures them all.'],
  [/^int(erface)? (vlan|vl)\s*\d/, 'Creates or enters a switch virtual interface (SVI), the Layer 3 interface for a VLAN.'],
  [/^int(erface)? (lo|loopback)\s*\d/, 'Creates or enters a loopback, a virtual interface that never goes down.'],
  [/^int(erface)? \S+\.\d+/, 'Creates or enters a subinterface, a logical slice of a physical port (router-on-a-stick).'],
  [/^int(erface)?\b/, 'Enters configuration for the named interface so you can set it up.'],
  [/^ip add(ress)? dhcp/, 'Makes the interface lease its IPv4 address from a DHCP server.'],
  [/^ip add(ress)?\b/, 'Assigns an IPv4 address and subnet mask to the interface.'],
  [/^ipv6 add(ress)? .*link-local/, 'Sets the interface link-local IPv6 address by hand instead of using EUI-64.'],
  [/^ipv6 add(ress)? .*eui-64/, 'Assigns an IPv6 address whose interface ID is built from the MAC address (EUI-64).'],
  [/^ipv6 add(ress)?\b/, 'Assigns an IPv6 address and prefix length to the interface.'],
  [/^ipv6 unicast-routing$/, 'Turns on IPv6 routing so the device forwards IPv6 packets.'],
  [/^ipv6 route ::\/0\b/, 'Adds an IPv6 default route, used when nothing more specific matches.'],
  [/^ipv6 route\b/, 'Adds a static IPv6 route: prefix/length, then the next hop or exit interface.'],
  [/^no shut(down)?$/, 'Enables the interface (brings it up). Router interfaces are shut down by default.'],
  [/^shut(down)?$/, 'Administratively disables the interface.'],
  [/^desc(ription)?\b/, 'Adds a text label to the interface for documentation.'],
  [/^switchport mode access$/, 'Makes the port an access port that carries a single VLAN, for an end device.'],
  [/^switchport mode trunk$/, 'Makes the port a trunk that carries multiple VLANs between switches.'],
  [/^switchport mode dynamic/, 'Lets DTP negotiate whether the port becomes a trunk.'],
  [/^switchport nonegotiate$/, 'Turns off DTP so the port never negotiates trunking.'],
  [/^switchport access vlan\b/, 'Puts this access port into the given VLAN.'],
  [/^switchport voice vlan\b/, 'Adds a voice VLAN on the port for an IP phone.'],
  [/^switchport trunk native vlan\b/, 'Sets the untagged native VLAN on the trunk. Both ends must match.'],
  [/^switchport trunk allowed vlan add\b/, 'Adds VLANs to the list the trunk may carry, keeping the ones already allowed.'],
  [/^switchport trunk allowed vlan remove\b/, 'Removes VLANs from the list the trunk may carry.'],
  [/^switchport trunk allowed vlan\b/, 'Replaces the list of VLANs the trunk is allowed to carry.'],
  [/^switchport trunk encapsulation\b/, 'Sets the trunk tagging method (802.1Q) on switches that support more than one.'],
  [/^switchport port-security maximum\b/, 'Sets how many MAC addresses port security allows on the port.'],
  [/^switchport port-security violation\b/, 'Chooses what happens on a violation: shutdown, restrict, or protect.'],
  [/^switchport port-security mac-address sticky\b/, 'Learns the connected MAC addresses and saves them into the running config.'],
  [/^switchport port-security$/, 'Turns on port security for this access port.'],
  [/^switchport port-security\b/, 'Configures port security to limit which or how many MAC addresses may use the port.'],
  [/^no switchport$/, 'Turns a switch port into a routed (Layer 3) port.'],
  [/^vlan\b/, 'Creates the VLAN if it does not exist and enters VLAN configuration mode.'],
  [/^name\b/, 'Gives the VLAN a readable name.'],
  [/^ip routing$/, 'Turns on IPv4 routing (needed on a Layer 3 switch).'],
  [/^ip route 0\.0\.0\.0 0\.0\.0\.0\b/, 'Adds a default route, the gateway of last resort for unknown destinations.'],
  [/^ip route \S+ \S+ \S+ \d+$/, 'Adds a static route with a custom administrative distance, for example a floating backup route.'],
  [/^ip route\b/, 'Adds a static route: destination network, mask, then the next hop or exit interface.'],
  [/^ip default-gateway\b/, 'Sets the gateway a Layer 2 switch uses for its own management traffic.'],
  [/^router ospf\b/, 'Starts the OSPF routing process with the given process ID.'],
  [/^network \S+ \S+ area\b/, 'Tells OSPF which interfaces to run on and which area they are in.'],
  [/^passive-interface\b/, 'Stops OSPF from sending hellos out this interface but still advertises its subnet.'],
  [/^router-id\b/, 'Manually sets the OSPF router ID that identifies this router.'],
  [/^default-information originate\b/, 'Advertises this router default route into OSPF.'],
  [/^ip ospf \d+ area\b/, 'Enables OSPF directly on this interface in the given area.'],
  [/^ip ospf cost\b/, 'Overrides the OSPF cost of this interface.'],
  [/^ip ospf priority\b/, 'Sets this interface priority in the DR election. 0 means never become DR.'],
  [/^ip domain[- ]name\b/, 'Sets the DNS domain name, which is required before generating SSH keys.'],
  [/^no ip domain[- ]lookup$/, 'Stops the device treating typos as hostnames to look up in DNS.'],
  [/^crypto key generate rsa\b/, 'Generates the RSA key pair that SSH uses to encrypt the session.'],
  [/^ip ssh version 2$/, 'Allows only SSH version 2, the secure version.'],
  [/^username\b.*secret/, 'Creates a local login account with a strongly hashed password.'],
  [/^username\b/, 'Creates a local login account.'],
  [/^enable secret\b/, 'Sets the privileged EXEC password, stored as a strong hash.'],
  [/^enable password\b/, 'Sets a privileged EXEC password (weakly protected, prefer enable secret).'],
  [/^service password-encryption$/, 'Applies weak type 7 encryption so plain-text passwords are not readable in the config.'],
  [/^banner motd\b/, 'Sets the message of the day banner shown before login.'],
  [/^line vty\b/, 'Enters configuration for the virtual terminal lines used by Telnet and SSH.'],
  [/^line con(sole)?\b/, 'Enters configuration for the console port line.'],
  [/^login local$/, 'Requires login using the locally configured usernames and passwords.'],
  [/^login$/, 'Requires the line password for login.'],
  [/^transport input ssh$/, 'Allows only SSH (not Telnet) to connect on these lines.'],
  [/^transport input telnet$/, 'Allows Telnet, which is insecure and sends data in clear text.'],
  [/^transport input\b/, 'Sets which remote-access protocols are allowed on these lines.'],
  [/^exec-timeout\b/, 'Logs out an idle session after the given minutes and seconds.'],
  [/^logging synchronous$/, 'Stops log messages from interrupting what you are typing.'],
  [/^access-class\b/, 'Applies a standard ACL to the VTY lines to limit who can open a management session.'],
  [/^password\b/, 'Sets the password for this line.'],
  [/^(ip access-list|access-list)\b.*\bremark\b/, 'Adds a comment to the ACL so others know its purpose.'],
  [/^ip access-list\b/, 'Creates or edits a named (or numbered) ACL in ACL configuration mode.'],
  [/^access-list \d+ (permit|deny) (tcp|udp|ip|icmp)\b/, 'Adds an extended ACL entry matching protocol, source, destination, and ports.'],
  [/^access-list\b/, 'Adds a line to a numbered access control list.'],
  [/^(\d+ )?permit\b/, 'Allows traffic that matches this ACL entry.'],
  [/^(\d+ )?deny\b/, 'Blocks traffic that matches this ACL entry.'],
  [/^ip access-group\b/, 'Applies an ACL to an interface in the inbound or outbound direction.'],
  [/^ip nat inside source list .* overload/, 'PAT: translates many inside hosts to one address, told apart by port numbers.'],
  [/^ip nat inside source static\b/, 'Static NAT: a permanent one-to-one mapping between an inside and an outside address.'],
  [/^ip nat inside source\b/, 'Defines how inside private addresses get translated to public ones.'],
  [/^ip nat pool\b/, 'Defines a pool of public addresses for dynamic NAT.'],
  [/^ip nat inside$/, 'Marks this interface as the inside (private) side of NAT.'],
  [/^ip nat outside$/, 'Marks this interface as the outside (public) side of NAT.'],
  [/^ip dhcp pool\b/, 'Creates a DHCP address pool and enters its configuration.'],
  [/^ip dhcp excluded-address\b/, 'Reserves addresses so DHCP does not hand them out.'],
  [/^ip dhcp snooping trust$/, 'Trusts this port to carry DHCP server messages (an uplink toward the real server).'],
  [/^ip dhcp snooping vlan\b/, 'Turns on DHCP snooping for these VLANs.'],
  [/^ip dhcp snooping$/, 'Enables DHCP snooping globally on the switch.'],
  [/^ip arp inspection trust$/, 'Trusts this port, so Dynamic ARP Inspection does not check ARP arriving on it.'],
  [/^ip arp inspection vlan\b/, 'Turns on Dynamic ARP Inspection for these VLANs.'],
  [/^default-router\b/, 'Sets the default gateway the DHCP pool gives to clients.'],
  [/^dns-server\b/, 'Sets the DNS server the DHCP pool gives to clients.'],
  [/^domain-name\b/, 'Sets the domain name the DHCP pool gives to clients.'],
  [/^lease\b/, 'Sets how long DHCP leases last.'],
  [/^ip helper-address\b/, 'Relays DHCP broadcasts to a DHCP server on another subnet (DHCP relay).'],
  [/^ntp server\b/, 'Points the device at an NTP server to sync its clock.'],
  [/^ntp master\b/, 'Makes this device an authoritative NTP source at the given stratum.'],
  [/^logging host\b|^logging \d/, 'Sends syslog messages to a server.'],
  [/^logging trap\b/, 'Chooses the most detailed severity sent to the syslog server.'],
  [/^snmp-server community\b/, 'Creates an SNMPv2c community string with read-only or read-write access.'],
  [/^snmp-server host\b/, 'Sends SNMP notifications (traps) to a management station.'],
  [/^snmp-server enable traps\b/, 'Turns on SNMP trap notifications.'],
  [/^ip name-server\b/, 'Sets the DNS server the device itself uses for lookups.'],
  [/^channel-group \d+ mode (active|passive)/, 'Adds the port to an EtherChannel negotiated with LACP.'],
  [/^channel-group \d+ mode (desirable|auto)/, 'Adds the port to an EtherChannel negotiated with PAgP (Cisco only).'],
  [/^channel-group\b/, 'Adds the interface to an EtherChannel bundle.'],
  [/^spanning-tree portfast$/, 'Enables PortFast so the access port forwards immediately instead of waiting for STP.'],
  [/^spanning-tree bpduguard enable$/, 'Shuts the port down if it receives a BPDU, protecting against rogue switches.'],
  [/^spanning-tree guard root$/, 'Root guard: blocks the port if a better root bridge appears through it.'],
  [/^spanning-tree vlan \S+ root\b/, 'Lowers this switch bridge priority so it wins (or backs up) the root election.'],
  [/^spanning-tree vlan \S+ priority\b/, 'Sets the bridge priority for these VLANs, in steps of 4096.'],
  [/^spanning-tree mode rapid-pvst$/, 'Switches to Rapid PVST+ (802.1w), which converges much faster.'],
  [/^spanning-tree\b/, 'Configures a Spanning Tree Protocol setting.'],
  [/^encapsulation dot1q\b/, 'Tags this subinterface traffic for the given VLAN (router-on-a-stick).'],
  [/^standby \d+ ip\b/, 'HSRP: sets the shared virtual gateway address for the group.'],
  [/^standby \d+ priority\b/, 'HSRP: sets this router priority. Highest priority becomes active.'],
  [/^standby \d+ preempt$/, 'HSRP: lets this router take back the active role when its priority is higher.'],
  [/^standby\b/, 'Configures HSRP, first-hop redundancy for the default gateway.'],
  [/^lldp run$/, 'Turns on LLDP, the open standard neighbor discovery protocol.'],
  [/^no cdp enable$/, 'Stops CDP on this interface so neighbors there cannot learn about this device.'],
  [/^no cdp run$/, 'Turns CDP off on the whole device.'],
  [/^cdp run$/, 'Turns CDP on for the whole device.'],
  [/^lldp (transmit|receive)$/, 'Enables sending or receiving LLDP on this interface.'],
  [/^clock set\b/, 'Sets the device clock by hand.'],
  [/^end$/, 'Jumps back to privileged EXEC mode from any config mode.'],
  [/^exit$/, 'Leaves the current configuration mode, one level up.'],
  [/^do\b/, 'Runs an EXEC command, such as show, without leaving configuration mode.'],
  [/^(wr(ite)?( mem(ory)?)?|copy run(ning-config)? start(up-config)?)$/, 'Saves the running config to NVRAM so it survives a reload.'],
  [/^reload$/, 'Restarts the device. Unsaved changes are lost.'],
  [/^ping\b/, 'Sends ICMP echo requests to test reachability.'],
  [/^traceroute\b/, 'Lists the routers a packet passes through on the way to a destination.'],
  [/^sh(ow)? (run|running-config)\b/, 'Displays the running configuration, the active config in RAM.'],
  [/^sh(ow)? start(up-config)?\b/, 'Displays the saved startup configuration in NVRAM.'],
  [/^sh(ow)? ip (int|interface) (br|brief)/, 'Lists every interface with its IPv4 address and up/down status.'],
  [/^sh(ow)? ip route\b/, 'Displays the IPv4 routing table.'],
  [/^sh(ow)? vlan\b/, 'Lists VLANs and which access ports belong to each.'],
  [/^sh(ow)? (int|interfaces) trunk\b/, 'Lists trunk ports, their native VLAN, and the VLANs they carry.'],
  [/^sh(ow)? ip ospf nei(ghbor)?\b/, 'Lists OSPF neighbors and their adjacency state.'],
  [/^sh(ow)? ip protocols\b/, 'Shows routing protocol settings, including OSPF networks and passive interfaces.'],
  [/^sh(ow)? access-lists\b/, 'Lists every ACL with its sequence numbers and match counts.'],
  [/^sh(ow)?\b/, 'Displays status or configuration. Show commands never change anything.']
]

/** Plain-language explanation of one IOS command, or null when there is none. */
export function explainCommand(line) {
  const cmd = String(line ?? '')
    .replace(/^\s*[A-Za-z][\w-]*(\([^)]*\))?\s*[>#]\s*/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!cmd) return null
  const rule = RULES.find(([re]) => re.test(cmd))
  return rule ? rule[1] : null
}

/** A small reference card for the sandbox panel, grouped by what you are doing. */
export const COMMAND_REFERENCE = [
  {
    title: 'Get around',
    items: [
      ['enable', 'User EXEC to privileged EXEC'],
      ['configure terminal', 'Into global config'],
      ['interface g0/0', 'Into interface config'],
      ['exit', 'Up one level'],
      ['end', 'Straight back to privileged EXEC'],
      ['do show ip interface brief', 'Run a show command from config mode']
    ]
  },
  {
    title: 'Look around',
    items: [
      ['show running-config', 'The active config'],
      ['show ip interface brief', 'Addresses and up/down state'],
      ['show ip route', 'The routing table'],
      ['show vlan brief', 'VLANs and their ports (switch)'],
      ['show interfaces trunk', 'Trunks and allowed VLANs (switch)'],
      ['show cdp neighbors', 'Directly connected Cisco devices']
    ]
  },
  {
    title: 'Save and recover',
    items: [
      ['copy running-config startup-config', 'Save so it survives a reload'],
      ['show startup-config', 'What is saved in NVRAM'],
      ['reload', 'Restart from the saved config']
    ]
  }
]
