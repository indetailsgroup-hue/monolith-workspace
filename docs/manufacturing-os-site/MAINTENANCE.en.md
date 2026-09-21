# Manufacturing documentation contract and maintenance

Owner approved on 2026-09-21 in the Codex task: phase range **0–15**, with Foundation=0. This explicitly supersedes the original audit requirement of 1–15; the original baseline result is preserved, not retroactively declared passing.

## Evidence and scope

Pinned source: `1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f`. All 55 Git blobs were compared with the DOC-S1 inventory. Chapters 01–27 explicitly declare `phase_num: 0`; chapters 28–55 explicitly declare phases 1–15. Examples: [chapter01](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f/docs/chapters/chapter-01.md), [chapter27](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f/docs/chapters/chapter-27.md), [chapter28](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f/docs/chapters/chapter-28.md), [chapter55](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f/docs/chapters/chapter-55.md).

This contract covers the documentation corpus, not product implementation maturity. The local governance/bootstrap root and nested product repository are separate Git roots; neither source prose nor chapter status proves production deployment.

## Required frontmatter

| Field | Contract |
|---|---|
| num | Integer 1–55 matching chapter-NN.md; booleans rejected |
| title | Non-empty string describing the existing body |
| phase | Integer 0–15; 0 is Foundation, 1–15 are numbered phases |
| phase_num | Integer exactly equal to phase; compatibility alias |
| phase_label | Foundation when phase=0; otherwise Phase N |
| mcp_tools | Nonnegative integer metadata count; booleans rejected |
| status | complete, in-progress, planned, or draft |

```yaml
---
num: 1
title: Executive Summary — Monolith Manufacturing OS
phase: 0
phase_num: 0
phase_label: Foundation
mcp_tools: 2
status: complete
---
```

## Accepted editorial changes

Titles02–10 now follow their existing body subjects: System Overview, Research & Background, Technical Architecture, Product Requirements Document (PRD), Technical Specifications, Developer Documentation, Rebuild Blueprint, Risk Management, Roadmap. Titles11–12 become Conclusions & Recommendations and API Reference — MCP Server & REST Endpoints. Chapter IDs and bodies remain unchanged. Existing labels move to phase_label; phase derives from the existing phase_num, never an invented assignment.

Metadata statuses remain 53 complete and 2 in-progress (54–55). MCP metadata sums to126, but this is neither a unique-tool count nor verified runtime inventory. Do not clear counts as presumed placeholders, promote status, move chapter content, or declare ADR implementation from DOC-S1 alone. Language differences in titles are not automatically defects.

## Local verification and generation

Run from repository root using Python3.12 and Node.js; Git Bash is required for embedded shell syntax tests on Windows.

```bash
python -m pip install -r scripts/docs/requirements.txt
python -m unittest discover -s tests/docs -v
python -c "from scripts.docs.site_data import *; c=render_chapters('docs/chapters'); s=search_index(c); validate_data(c,s,{str(n) for n in range(1,56)}); write_json('docs/manufacturing-os-site/chapters.json',c); write_json('docs/manufacturing-os-site/search_index.json',s)"
python -m scripts.docs.site_data
python -m http.server 3000 --directory docs/manufacturing-os-site
```

The generator and release sync use the same renderer. Cache fingerprints include source, renderer/workflow and dependency versions. Missing or invalid generated data forces rebuilding. Keep maintenance documents outside docs/chapters: all Markdown files there are validated as chapter sources. Adding chapter56 or phase16 requires an explicit schema and UI change first.

## Review and deployment evidence

Open a PR and verify actual Actions on its head SHA. Required branch-protection checks must pass; do not equate local tests with Actions. Verify frontmatter and generated JSON, then review chapter01/chapter55, global search and code blocks in a browser.

| Destination | Deployment mechanism | Acceptance evidence |
|---|---|---|
| [GitHub Pages](https://indetailsgroup-hue.github.io/monolith-workspace/) | deploy-docs-pages.yml and auto-deploy-scispace.yml both use deploy-pages | Successful deployment run, deployed SHA/artifact, live content |
| [SciSpace site](https://0ly1b489.scispace.co/) | Separate SciSpace publishing process | SciSpace publication evidence and independently checked live content |

The workflow named Auto-Deploy SciSpace Site does **not** publish to scispace.co. A reachable old site is not proof that the PR was deployed. Record pending/skipped/failed runs as observed. Lighthouse requires performance≥70 and accessibility≥90; reports/comments must be preserved before the final gate fails.
