# Claim-guardrails editorial correction

Scope: PR121 follow-up against1c5a8b9c2. Six chapter files and regenerated site data. All23 findings concern input conditions, displayed samples, case labels or hypothetical scenarios. No repository-wide absence conclusion was established by these lines. The linter, allowlist and CI remain byte-for-byte unchanged.

| # | Source at 1c5a8b9c2 | Identifier | Classification |
|---|---|---|---|
| 1 | [chapter12:49](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-12.md#L49) | `MCP_TOKEN` | Conditional API/input scenarios |
| 2 | [chapter12:55](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-12.md#L55) | `401 Unauthorized` | Conditional API/input scenarios |
| 3 | [chapter12:675](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-12.md#L675) | `jobId` | Conditional API/input scenarios |
| 4 | [chapter12:676](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-12.md#L676) | `500` | Conditional API/input scenarios |
| 5 | [chapter12:1585](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-12.md#L1585) | `JOB_NOT_FOUND` | Conditional API/input scenarios |
| 6 | [chapter12:1586](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-12.md#L1586) | `PANEL_NOT_FOUND` | Conditional API/input scenarios |
| 7 | [chapter26:223](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-26.md#L223) | `requiredConsentScopes` | Conditional consent policy |
| 8 | [chapter26:224](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-26.md#L224) | `consentRecords` | Conditional consent policy |
| 9 | [chapter26:229](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-26.md#L229) | `deniedBy: "pdpa:missing_consent"` | Conditional consent policy |
| 10 | [chapter30:65](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-30.md#L65) | `missing_in_physical` | Displayed code sample |
| 11 | [chapter30:66](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-30.md#L66) | `missing_in_shadow` | Displayed code sample |
| 12 | [chapter30:70](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-30.md#L70) | `inSync` | Displayed code sample |
| 13 | [chapter31:32](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-31.md#L32) | `governance/pdpa.test.ts` | Test-case labels |
| 14 | [chapter31:107](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-31.md#L107) | `canInvoke` | Test-case labels |
| 15 | [chapter35:224](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-35.md#L224) | `absence` | Alert trigger condition |
| 16 | [chapter38:60](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-38.md#L60) | `manage_customer_feedback` | Hypothetical persona scenarios |
| 17 | [chapter38:92](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-38.md#L92) | `get_inventory_report` | Hypothetical persona scenarios |
| 18 | [chapter38:121](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-38.md#L121) | `create_dashboard` | Hypothetical persona scenarios |
| 19 | [chapter38:124](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-38.md#L124) | `manage_consent` | Hypothetical persona scenarios |
| 20 | [chapter38:154](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-38.md#L154) | `manage_customer_feedback` | Hypothetical persona scenarios |
| 21 | [chapter38:187](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-38.md#L187) | `create_digital_shadow` | Hypothetical persona scenarios |
| 22 | [chapter38:189](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-38.md#L189) | `optimize_schedule` | Hypothetical persona scenarios |
| 23 | [chapter38:190](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c5a8b9c24a9a529035d90551ca8f4f399046095/docs/chapters/chapter-38.md#L190) | `manage_installation` | Hypothetical persona scenarios |

Corrections preserve omitted-configuration semantics, error codes, input names and consent decision outcomes. Empty-array behavior remains unspecified; it is not verified here. Chapter30 uses a native Markdown fence around the existing sample. Chapter31 case labels are formatted as inline code. Chapter38 labels its before/after scenarios as hypothetical, proposed behavior as proposed, and numerical metrics as targets requiring measurement. This is an editorial clarification, not runtime validation.

Validation: documentation regression23/23; guardrail regression227 total,222 successful and5 skipped in a byte-verified temporary copy; full-corpus negative-claim and certification CLI checks exit0. Initial worktree regression had15 failures because absolute fixture paths under .codex were excluded; running the same120 copied tracked files outside that ancestor resolved those15 failures. The path-sensitive behavior remains a separate known limitation.

Scope routing: parent governance HEADaa1b30e5 and nested product HEAD9c4bee67 were inspected separately (694 and83 status entries respectively). Changes are confined to the isolated repair worktree. Local checks do not establish deployment or current product maturity.

The original one-time hook exception applied only to1c5a8b9c2. This follow-up must commit through the normal hook. GitHub Actions must be checked on the new head before concluding that PR CI is clear.

[PR #121](https://github.com/indetailsgroup-hue/monolith-workspace/pull/121)
