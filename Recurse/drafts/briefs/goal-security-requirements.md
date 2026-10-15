# Security Engineer / SOC analyst (entry level): what the role asks for

Sources of the list: common requirements in entry-level security engineer, SOC analyst (tier 1),
junior AppSec and junior cloud security postings; what interviews test (networking, Linux, web vulns,
auth flows, log triage scenarios, "walk me through an incident"); public roadmaps (security
fundamentals -> networking -> OS -> scripting -> crypto -> IAM -> appsec -> defense/monitoring ->
IR -> cloud -> offense for defenders), and Security+ / CySA+ objective areas.

| # | Requirement | Covered by (pack ids) |
|---|---|---|
| 1 | TCP/IP, ports, DNS, DHCP, subnets, routing, NAT | networking-basics, ccna-osi-tcp-udp |
| 2 | Linux CLI, permissions, processes, logs | linux-cli, operating-systems |
| 3 | Scripting: Python, regex, bash one-liners | python-basics, python-intermediate, regex-basics, linux-cli (+ bash-scripting when G5 lands) |
| 4 | Git and containers | git-basics, docker-basics |
| 5 | Security concepts: CIA, threats, risk, attack types | cybersecurity-101, ccna-security-concepts |
| 6 | Cryptography, TLS, PKI, VPN | cryptography-basics, ccna-vpn |
| 7 | IAM: MFA, SSO, SAML/OAuth/OIDC, JWT, RBAC/ABAC, PAM, AD/Kerberos, zero trust | security-identity-access (NEW) |
| 8 | Web app security, OWASP Top 10 | http-web, swe-web-security |
| 9 | Secure SDLC, threat modeling (STRIDE, DFDs), SAST/DAST/SCA, supply chain, secrets | security-appsec (NEW) |
| 10 | Vulnerability management (CVE, CVSS, KEV/EPSS, scanning, patch SLAs) | security-offensive-basics (NEW, section on scanning and prioritizing), security-appsec (SCA) |
| 11 | Network defense: firewalls, ACLs, segmentation, IDS/IPS, L2 attacks, device hardening | security-network-defense, ccna-acls, ccna-layer2-security, ccna-device-security (+ console labs) |
| 12 | Logging and SIEM, log analysis | security-network-defense, ccna-ntp-snmp-syslog, regex-basics, security-cloud (audit logs), project auth-log-analyzer |
| 13 | Incident response (NIST lifecycle, triage, evidence) | cybersecurity-101 (s7), security-network-defense, project write-up |
| 14 | Cloud security: shared responsibility, IAM policies, misconfig, logging, KMS, containers/K8s | security-cloud (NEW), docker-basics |
| 15 | Offensive basics for defenders: legal scope, ATT&CK, recon/nmap, exploitation concepts, privesc, password attacks, reporting | security-offensive-basics (NEW) |
| 16 | How security teams work: SOC tiers, red/blue/purple, AppSec/GRC, frameworks (NIST CSF, ATT&CK), reporting | security-offensive-basics (s0, s9), security-appsec (s0), security-network-defense (if it covers SOC) |
| 17 | Portfolio evidence | projects: security-log-analyzer (NEW), web-app-security-assessment (NEW) |
| 18 | Getting hired | swe-resume-portfolio, swe-behavioral-interviews |
