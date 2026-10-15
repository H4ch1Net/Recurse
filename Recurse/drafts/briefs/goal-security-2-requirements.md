# Security Engineer (defensive): what the role asks for

Scope: entry-level security engineer, SOC analyst (tier 1) and junior application / cloud security
roles, built entirely from the defender's side. No offensive pack. Attacks appear only at the
conceptual level needed to understand a defense, always paired with the mitigation.

Sources (from general knowledge, nothing copied): common asks in entry-level security engineer,
SOC analyst, junior AppSec and junior cloud security postings; what interviews test (networking,
Linux, auth flows, web vulns and their fixes, log triage, "walk me through an incident", "how would
you secure this design", "how do you prioritize these vulnerabilities"); public roadmaps; the
Security+ / CySA+ objective areas; NIST CSF 2.0 functions.

| # | Requirement | Covered by (pack ids) |
|---|---|---|
| 1 | TCP/IP, ports, DNS, DHCP, subnets, routing, NAT, how the web works | networking-basics, ccna-osi-tcp-udp, http-web |
| 2 | Linux CLI: files, permissions, processes, logs, ssh, bash one-liners | linux-cli, operating-systems |
| 3 | Scripting for automation: Python, regex for logs | python-basics, python-intermediate, regex-basics |
| 4 | Git and containers | git-basics, docker-basics |
| 5 | Security concepts: CIA, threats, vulnerabilities, attack types and their mitigations | cybersecurity-101, ccna-security-concepts |
| 6 | Cryptography, TLS, PKI, VPN | cryptography-basics, ccna-vpn |
| 7 | IAM: factors, MFA and phishing-resistant MFA, password policy, SSO, SAML / OAuth 2.0 / OIDC, JWT validation, RBAC / ABAC, least privilege, PAM, AD and Kerberos awareness, joiner-mover-leaver, zero trust | security-identity-access (NEW) |
| 8 | Web application security, OWASP Top 10 and the fixes | http-web, swe-web-security |
| 9 | Secure SDLC, threat modeling (DFD, STRIDE), risk rating, SAST / DAST / SCA in CI, supply chain and SBOMs, secrets management, security code review, abuse cases as tests | security-appsec (NEW) |
| 10 | Network defense: firewalls, ACLs, segmentation, IDS/IPS, L2 protections, device hardening | security-network-defense (other agent), ccna-acls, ccna-layer2-security, ccna-device-security, ccna-wireless-security + console labs |
| 11 | Logging, SIEM, detection, log analysis | security-network-defense, ccna-ntp-snmp-syslog, regex-basics, security-cloud (audit logs), project auth-log-monitor |
| 12 | Incident response lifecycle and triage | cybersecurity-101 (s7), security-network-defense, security-cloud (leaked key response) |
| 13 | Cloud security: shared responsibility, IAM policies, misconfiguration detection and prevention, network controls, audit logging, KMS and secrets, containers and Kubernetes, compliance awareness | security-cloud (NEW), docker-basics, swe-cloud-devops |
| 14 | Vulnerability management: lifecycle, CVE / CVSS / EPSS / KEV, prioritization with context, SLAs | security-operations (NEW) |
| 15 | Risk, policy and compliance awareness: risk registers, policy hierarchy, exceptions, SOC 2 / ISO 27001 awareness | security-operations (NEW), security-cloud (compliance section) |
| 16 | Working in a security team: functions, frameworks (NIST CSF, CIS Controls), metrics, awareness programs, writing findings and post-incident reports, working with engineering | security-operations (NEW) |
| 17 | Portfolio evidence | projects: auth-log-monitor (NEW), threat-model-review (NEW); ccna-secure-edge (existing) for the network side |
| 18 | Getting hired | swe-resume-portfolio, swe-behavioral-interviews |

Hands-on practice inside Recurse: console labs for hardening, ACLs, port security, DHCP snooping,
SSH, syslog and NTP; http-explorer auth scenario; terminal pipes scenario; regex-tester puzzles for
logs and secret scanning; json-explorer for a JWT, an IAM policy and a CloudTrail event; Python
code-runners for TOTP, JWT validation, policy evaluation, misconfiguration scanning, SBOM lookups,
vulnerability prioritization and log parsing.
