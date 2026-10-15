# Portfolio projects

Projects are build briefs that turn what a learner studies in Recurse into evidence an employer can
see: a repository, a live demo, a lab write-up. Each one says what to build, the milestones to get
there, how a reviewer will judge it, and how to present it on a resume and in an interview.

They live in `src/data/projects/<id>.json`, one project per file. The file name must equal the `id`.

## Shape

```json
{
  "id": "cli-task-manager",
  "title": "Command-line task manager",
  "track": "swe",
  "level": "beginner",
  "hours": 12,
  "summary": "One sentence: what the learner builds.",
  "why": "Two or three sentences: what this proves to an employer or interviewer.",
  "skills": ["Python", "File I/O and JSON", "pytest"],
  "topics": ["python-basics", "swe-testing"],
  "brief": "Two to four paragraphs separated by a blank line (\n\n): what to build and the constraints.",
  "milestones": [
    {
      "title": "Core model and storage",
      "tasks": ["Define a task as a dataclass", "Write load and save functions"],
      "doneWhen": "From a Python shell you can add three tasks, restart, load, and see the same three tasks."
    }
  ],
  "stretch": ["Recurring tasks", "Export to CSV"],
  "rubric": ["A reviewer should see core logic separated from argument parsing", "..."],
  "showcase": ["README sections: what it does, a GIF, install, usage, design notes, tests", "..."],
  "resumeBullet": "Built a Python command-line task manager with ...; wrote 30+ pytest tests ...",
  "interviewTalkingPoints": ["Why you separated storage from the CLI layer", "..."]
}
```

| Field | Rules |
|---|---|
| `id` | kebab-case, unique across all projects, equal to the file name |
| `title` | short name shown on the project card |
| `track` | `swe` or `ccna` (the learning path the project belongs to) |
| `level` | `beginner`, `intermediate` or `advanced` |
| `hours` | honest estimate of focused hours for the core milestones (stretch goals not included) |
| `summary` | one sentence |
| `why` | 2 or 3 sentences on what the finished project proves to an employer |
| `skills` | 3 to 8 short skill names, as they would appear on a resume |
| `topics` | ids of Recurse packs the project draws on. Use real pack ids so the app can link them (SWE path ids, CCNA path ids, or existing packs such as `python-basics`) |
| `brief` | 2 to 4 paragraphs separated by `\n\n`. Same inline markup as lessons: `backticks` for code and commands, `**bold**` for key terms |
| `milestones` | 4 to 7 objects, in build order. `tasks` is 2 to 4 concrete steps. `doneWhen` is a checkable statement: something the learner can run, see or show, not "understand X" |
| `stretch` | optional extensions that make the project stand out |
| `rubric` | 5 to 8 checkable quality criteria, each starting "A reviewer should see" (or "should be able to" / "should find") |
| `showcase` | how to present it: README sections, GIFs or screenshots, live links, what to pin, where to list it |
| `resumeBullet` | an example bullet in the action verb + what + how + result form. It is a template: learners replace the numbers with their own measurements (the `swe-resume-portfolio` pack teaches this) |
| `interviewTalkingPoints` | trade-offs and decisions worth explaining in an interview |

Style rules are the same as for packs: plain, direct sentences, American spelling, no em dashes.
Numbers in `resumeBullet` are illustrative; never present them as the learner's real results.

## Recommended order

The SWE projects build on each other, from a first tested program to a measured system design:

| # | id | Level | Builds on |
|---|---|---|---|
| 1 | `cli-task-manager` | beginner | none |
| 2 | `api-cli-tool` | beginner | 1 (core module plus a thin CLI) |
| 3 | `data-structures-library` | intermediate | testing habits from 1 and 2 |
| 4 | `algorithm-visualizer` | intermediate | 3 (algorithms), first frontend |
| 5 | `rest-api-with-db` | intermediate | 2 (HTTP), databases and auth |
| 6 | `full-stack-app` | advanced | 4 (frontend) and 5 (its API) |
| 7 | `open-source-contribution` | advanced | git, testing and review habits from all of the above |
| 8 | `url-shortener-design` | advanced | 5 (API and database), adds caching and load testing |

The CCNA projects follow the exam domains and can be done in Cisco Packet Tracer or Cisco Modeling
Labs at home:

| # | id | Level | Builds on |
|---|---|---|---|
| 1 | `ccna-small-office` | beginner | none (VLANs, trunks, inter-VLAN routing, DHCP) |
| 2 | `ccna-multisite-ospf` | intermediate | 1 (addressing and switching), adds OSPF and HSRP |
| 3 | `ccna-secure-edge` | intermediate | 1 (the same office), adds ACLs, NAT/PAT, SSH and port security |
| 4 | `ccna-automation-report` | advanced | any lab, needs Cisco Modeling Labs or a DevNet sandbox for real SSH or RESTCONF access |

There is no `order` field in the files. Sorting by `level` alone groups them correctly, but within
a level use the tables above (or add an optional numeric `order` field if the app needs a fixed sequence).

## CCNA projects

Network projects are shown to employers differently from code. Every CCNA brief asks for:

- a labeled topology diagram and an addressing table,
- per-device running configurations exported as text (sanitized: no password hashes or keys) in a
  GitHub repository, plus the `.pkt` or lab file,
- a test plan with expected and observed results, backed by saved `show` output,
- a troubleshooting write-up (symptom, command used, cause, fix), which employers often value more
  than the configs themselves.

Packet Tracer does not expose devices to outside Python scripts, so the automation project points
learners to Cisco Modeling Labs (including its free edition) or a Cisco DevNet sandbox.

## Checking a project file

There is no dedicated validator yet. At minimum, check that each file parses:

```bash
for f in src/data/projects/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f'))" || echo "bad: $f"; done
```

and that every id in `topics` names a real pack once the packs exist.
