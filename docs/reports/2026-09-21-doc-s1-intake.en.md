# DOC-S1 intake acceptance

Inventory VERIFIED; package accepted with recorded limitations, not as runtime certification.

| Package | ZIP entries | Manifest rows | Hash + size PASS |
|---|---:|---:|---:|
| doc-s1 | 26 | 21 | 21 |
| v4.1 | 66 | 65 | 65 |

DOC-S1 outer SHA256: `4712b25aa80dc0f3ef2cc6e3a68c3921b12413c81bc0f0610ca8813502f00e47`

v4.1 SHA256: `e6f23a67dd092bbf1ee88ab457f942ebe9917884faa6cad8d7d343be67fcac2d`

All 55 inventory rows, seven metadata fields, source sizes and pinned locators match Git blobs. DOC-S1 omits checksum coverage for chapters_parsed.json and three manifest HTML files; excluding the manifest itself is normal. Its changed-file-list says22, but ZIP contains26. Three manifest documents lack Thai editions. Preserve the original ZIP unchanged; intake-verification.json records hashes and omissions. v4.1 has65 matching payload checksums plus its checksum file; its historical governance findings remain unaccepted for current-state claims.

Accepted corrections: phase contract and titles02–12 described in MAINTENANCE.en.md. Rejected claims: changing only phase_num requires no file edits; all01–12 have mcp_tools2 (chapter12 has1); presumed placeholder counts; body count120 is runtime-authoritative; title language difference proves a content error. DOC-S2 draft is not copied wholesale: it misstates repository structure, schema, future chapter56 support and deployment readiness. No body content, MCP counts or status changed.

Primary room received and acknowledged the independently verified findings and owner-approved contract. GitHub Pages and SciSpace deployment remain separate release gates.

[Primary SciSpace room](https://scispace.com/chat/4965a6a4-e854-4128-95cc-d5e7a95ea7c7)
