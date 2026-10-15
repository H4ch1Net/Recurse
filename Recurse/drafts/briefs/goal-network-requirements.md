# Network Engineer path: what the goal really requires

Sources of the list: typical entry-level / junior network engineer and NOC engineer postings
(CCNA required or preferred; routing and switching; firewalls and VPN; monitoring tools;
ticketing and change control; scripting a plus; cloud a plus), common interview loops
(OSI and TCP/IP, subnetting on a whiteboard, VLAN/STP/OSPF/BGP questions, "a user cannot
reach X, walk me through it", packet capture reading, behavioral), and public roadmaps
(networking fundamentals -> CCNA -> Linux -> Python automation -> cloud -> CCNP-level routing).

| # | Requirement | Where in Recurse |
|---|---|---|
| 1 | OSI/TCP-IP, encapsulation, TCP vs UDP, ports | networking-basics, ccna-osi-tcp-udp |
| 2 | IPv4/IPv6 addressing, subnetting and VLSM fast | ccna-ipv4-addressing, ccna-subnetting, ccna-ipv6 (+ subnet-drill) |
| 3 | Devices, cabling, interfaces, campus/WAN/DC designs | ccna-network-components, ccna-cabling-interfaces |
| 4 | Switching: MAC learning, VLANs, trunks, STP, EtherChannel, CDP/LLDP | ccna-switching, ccna-vlans, ccna-trunking, ccna-stp, ccna-etherchannel, ccna-cdp-lldp (+ console labs) |
| 5 | Wireless basics and WLC config | ccna-wireless-principles, ccna-wireless-architectures, ccna-wireless-security |
| 6 | Routing: routing table, static, inter-VLAN, OSPF, FHRP | ccna-routing-table, ccna-static-routing, ccna-intervlan-routing, ccna-ospf, ccna-fhrp |
| 7 | IP services: DHCP, DNS, NAT/PAT, NTP, QoS | ccna-dhcp-dns, ccna-nat, ccna-ntp-snmp-syslog, ccna-qos |
| 8 | Secure management: SSH, AAA, hardening, file transfer | ccna-device-management, ccna-ssh-tftp-ftp, ccna-device-security |
| 9 | Security: ACLs, L2 security, VPN/IPsec, firewalls, segmentation, IDS/IPS | ccna-security-concepts, ccna-acls, ccna-layer2-security, ccna-vpn, security-network-defense |
| 10 | Structured troubleshooting method | ccna-troubleshooting, network-operations (s9), troubleshooting labs |
| 11 | CCNA certification itself | ccna-exam-strategy + CCNA path practice exam |
| 12 | Controllers, SDN, REST/JSON, Ansible/Terraform concepts, AI in ops | ccna-automation-sdn, ccna-rest-apis-json, ccna-config-management, ccna-ai-ml |
| 13 | Linux CLI (jump hosts, servers, tcpdump, logs) | linux-cli |
| 14 | Git for configs and scripts | git-basics |
| 15 | Python: scripts, data structures, files, errors | python-basics, python-intermediate |
| 16 | Regex for show output and logs | regex-basics |
| 17 | Network automation: Netmiko, parsing, TextFSM, NETCONF/RESTCONF/YANG, Ansible network modules, configs in Git, CI, safe rollout | NEW network-automation-python |
| 18 | Cloud networking: VPC/VNet, route tables, IGW/NAT, SG vs NACL, LB, DNS, peering/transit, VPN and dedicated links, AWS/Azure/GCP names | NEW cloud-networking |
| 19 | Routing beyond CCNA: BGP (eBGP/iBGP, states, attributes, best path, config/output), redistribution, EIGRP and multi-area OSPF awareness, MPLS L3VPN, SD-WAN, internet edge | NEW routing-beyond-ccna |
| 20 | Operations: monitoring stack, SNMP polling vs traps and counter math, NetFlow/IPFIX, syslog pipelines, baselines/alerting, packet capture reading (TCP, DNS, DHCP), change management, documentation, troubleshooting at scale, on-call | NEW network-operations |
| 21 | Portfolio evidence: lab builds with docs, an automation tool, a design document | ccna-small-office, ccna-multisite-ospf, ccna-secure-edge, ccna-automation-report, NEW net-config-backup, NEW net-multisite-design |
| 22 | Interviews and resume | swe-behavioral-interviews, swe-resume-portfolio (generic enough; no network-specific job-search pack exists: gap) |
