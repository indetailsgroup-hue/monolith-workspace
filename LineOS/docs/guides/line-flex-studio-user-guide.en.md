# MONOLITH LINE Flex Studio — Operator Guide

- Status: approved standalone prototype guidance
- Edition: English
- Verified against the local Studio and official LINE documentation on 2026-08-02

## 1. Purpose and safety boundary

LINE Flex Studio is a local authoring and review surface for one Flex Message bubble. It helps an operator select a governed preset, edit Header, Hero, Body and Footer content, inspect a responsive preview, validate the generated JSON, and rehearse an exact-action review in Mock LIFF.

The Studio is not a Messaging API sender, production LIFF app, system of record, authorization engine or signing service. It contains demo tenant and recipient references only. Do not enter customer personal data, a channel secret, channel access token, bearer token or other production secret. The authoritative revision, permission, workflow and audit records remain in MONOLITH.

> Standalone result: no message was sent and no business state changed. “Verification Receipt — Demo” is not a production signature.

## 2. Quick start with a local static server

From the parent repository root, start a local static server:

```powershell
python -m http.server 4177 --directory LineOS
```

Open `http://localhost:4177/line-flex-studio.html`. Keep the terminal open while using the Studio and stop the server when finished. Use only localhost for this prototype. Do not add a production token or secret to the command, URL, JSON or browser storage.

## 3. Studio Console map

| Area | What it does | Operator check |
|---|---|---|
| App header | Shows `Daph Studio · Secured by MONOLITH` and changes TH/EN | Confirm the demo tenant and language before editing. |
| Editor | Chooses one of five presets and edits Header, Hero, Body and Footer | Confirm audience, revision, requester, deadline and consequence. |
| LINE Preview | Shows the local visual approximation and starts Mock LIFF | Treat it as a design aid, not official-client proof. |
| JSON Preview | Updates generated JSON and UTF-8 bubble bytes in real time | Review payload and validation before copy or download. |
| Validation | Shows severity, rule ID, source classification and source link | Resolve every `error`; assess each `warning` and `guidance` item. |

On a narrow screen, Editor, Preview and JSON & Validation become keyboard-operable tabs.

## 4. Choose one of the five presets

Select the preset whose business intent matches the journey; do not repurpose wording while leaving the action intent unchanged.

| Preset ID | Use it for | Default action boundary |
|---|---|---|
| `design-approval` | “Design ready for review” for a named revision | High risk: URI opening LIFF for exact revision review and explicit confirmation. |
| `quote-order` | Quote, scope and order-intent review | High risk: LIFF; chat text is not order truth. |
| `sla-escalation` | Personal internal SLA acknowledgement | Low-risk postback acknowledges receipt only; monetary approval opens the work item. |
| `site-update` | Curated customer-facing site progress | Read-only URI; internal group photos are not automatically customer evidence. |
| `issue-evidence` | Acknowledge quarantined field evidence | Low-risk postback; a human verifies actor and project before promote/reject. |

Changing preset or language creates a fresh preset draft and invalidates any in-page demo transaction or receipt.

## 5. Edit Header, Hero, Body and Footer

Use the block tabs in order:

1. **Header:** edit eyebrow, title, status and `altText`. Make the message recognizable without the image. `altText` is mandatory and limited to 1,500 characters by LINE.
2. **Hero:** set the exported HTTPS URL, aspect ratio and aspect mode. The preview uses a bundled local SVG substitute; exported JSON uses the HTTPS URL. A production image must be published separately under approved media controls.
3. **Body:** verify project, revision, requester, amount/scope, deadline, summary and trust note. Never imply that a chat message is authoritative business state.
4. **Footer:** write one clear primary CTA, use a secondary CTA sparingly, and verify the requested action type. High-risk intent must not use Message or Postback as final authorization.

Every input updates the preview, JSON, byte count and findings from the same in-memory draft.

## 6. Preview widths and bilingual wrapping

Use browser responsive mode to inspect the page and card at **320**, **360** and **390** CSS pixels. The v1 phone frame scales responsively up to 360 px; the three widths are test conditions, not three official LINE client emulators.

At every width, test:

- Thai and English editions;
- long project and person names;
- Thai line breaking without spaces;
- English word wrapping, numbers, currency and emoji;
- large system font settings;
- hero cover cropping and CTA visibility.

Official LINE clients can render the same Flex Message differently by OS, LINE version, resolution, language and font. Complete real-client checks before controlled delivery.

## 7. JSON copy and download

The JSON panel is the current generated Flex payload. The byte indicator measures the bubble definition:

- at or below 24 KB: within the MONOLITH soft budget;
- above 24 KB through 30 KB: warning zone; simplify before release;
- above 30 KB: LINE hard-limit `error` and export is blocked.

`Copy JSON`, `Download JSON` and `Run Journey` are disabled while any blocking `error` exists. This prevents a known-invalid or unsafe draft from becoming a handoff artifact. Warnings and guidance stay visible but do not alone block export. After copy or download, treat the file as untrusted input to a controlled integration; it contains no authority to send.

The v1 action URI and Hero export URL use `example.com` demo placeholders. A controlled server integration must resolve approved environment-specific LIFF and media URLs; never send the standalone export directly to a customer.

## 8. Read validation findings

| Severity | Meaning | Required response |
|---|---|---|
| `error` | Violates a required LINE constraint or an approved MONOLITH safety boundary | Fix before export or Mock LIFF. Use the Fix button to focus the field. |
| `warning` | Exceeds a MONOLITH usability/safety budget or needs deliberate review | Record the decision and normally remediate before release. |
| `guidance` | Calls out preview substitutions or future production controls | Verify the downstream production owner and evidence. |

Source classifications are explicit:

- `official_constraint` links to current LINE Developers documentation.
- `monolith_best_practice` links to the approved MONOLITH design specification.

The source link supports the rule; it does not certify the current draft or a production deployment.

## 9. Rehearse the Mock LIFF exact-action review

1. Resolve all blocking errors.
2. Select `design-approval` without a live LIFF connection; the standalone rehearsal ends with **Verification Receipt — Demo**
3. Choose **Run Journey**.
4. In **PRIVATE REVIEW — DEMO**, compare tenant, recipient, project, revision, canonical action, consequence, action mode and expiry with the card.
5. Cancel if any value is unexpected. If values are exact, choose **Confirm demo intent** once.
6. Editing a bound field, expiry, tampering or mismatching a transaction makes the confirmation fail closed and requires a new review.

For real service, initialize with `liff.init()` and use `liff.login()` when the documented external/in-app-browser path requires login. Send the **raw `liff.getIDToken()` ID token or access token** to the server over HTTPS, then **verify using LINE's documented server flow** before mapping the verified LINE subject to the stored MONOLITH principal. **Direct LINE Login authorization requests inside the LIFF browser are not guaranteed**; keep the supported LIFF login path instead of constructing a direct authorization request inside LIFF.

Keep identity, routing, authorization correlation and business transaction authority separate:

| Concept | Meaning and required handling |
|---|---|
| MONOLITH transaction reference | A server-created, server-stored, high-entropy opaque reference with CSRF/session binding; bound to tenant, principal/audience, resource, revision, action, expiry and exact return target; one-time consumed atomically. It is not an ID-token nonce. |
| LINE-managed liff.state | Additional LIFF URL information carried by LINE; untrusted routing input; not OAuth state, not permission and not the MONOLITH transaction reference. Process routing only after `liff.init()` resolves. |
| OAuth state | CSRF correlation for a separate supported authorization flow; created and stored by that flow; not liff.state and not business permission. |
| OIDC nonce | ID-token replay/correlation input; compare only when a separate supported authorization flow lets MONOLITH supply it and LINE returns the ID-token claim. |

After identity verification, the server must reload the authoritative revision and permission, bind the exact-action review to the MONOLITH transaction reference, perform MONOLITH step-up for consequential actions, atomically consume the reference with the command result, and append immutable audit evidence. Forwarded URLs and `liff.state` can propose routing only; they cannot grant permission or select authoritative tenant/resource/revision/action values.

## 10. Interpret Verification Receipt — Demo

The demo receipt binds a generated transaction ID to demo tenant, recipient, revision, canonical action, outcome and confirmation time, then displays a local digest. The ribbon states `DEMO — NOT A PRODUCTION SIGNATURE`.

It proves only that the current browser demo completed its local exact-value path. It is not a LINE delivery receipt, human identity proof, legal signature, MONOLITH audit record or authorization decision. A production Signed Receipt requires the Trust Kernel, authoritative server records, approved signer and key management, one-time transaction consumption and durable audit.

## 11. Keyboard operation

- Use `Tab` and `Shift+Tab` to reach controls; activate a button with `Enter` or `Space`.
- On Header/Hero/Body/Footer tabs, use `ArrowLeft`, `ArrowRight`, `Home` and `End`.
- On narrow-screen Editor/Preview/JSON tabs, use the same arrow, Home and End keys.
- Use the skip link to move to the work area.
- Native dialogs keep focus inside while open; use Cancel or `Escape` to leave the review, then focus returns to Run Journey.
- Do not use the preview CTA itself: it is deliberately excluded from keyboard focus because Run Journey is the controlled demo trigger.

## 12. Clear demo state

- Choose **Reset** to restore the current preset. The browser asks for confirmation only when the draft differs from its preset baseline.
- Switching preset or TH/EN rebuilds the draft and clears the in-page transaction/receipt.
- Reload the page to discard all current-page memory. The v1 Studio does not use persistence for the draft.
- Delete any JSON file you downloaded if it is no longer approved for use; handle it under the organization’s normal document-retention rule.

## 13. Troubleshooting

| Symptom | Check | Safe response |
|---|---|---|
| Empty preview | Confirm the static server is running and the page loaded over localhost rather than opening modules as a raw file | Reload from the localhost URL; inspect browser console only in a development environment. |
| Broken hero | Local preview and exported URL are different. Check `LineOS/assets/line-flex-studio/` for preview and the Hero HTTPS URL for export | Restore the preset; for future production, publish a valid HTTPS JPEG/PNG and retest. |
| Invalid URL | The Hero export URL must start with HTTPS and stay within the documented URL limit | Fix the Hero field; never replace it with `data:`, base64 or a secret-bearing URL. |
| Over-budget payload | Byte status is warning above 24 KB or error above 30 KB | Shorten copy, remove decorative nesting and retest; do not bypass the block. |
| Clipboard denial | Browser policy or permission denied clipboard access | Select the visible JSON and copy manually, or use Download JSON after validation. Do not weaken browser security settings. |
| Journey does not open | Blocking validation or required Web Crypto/dialog APIs are unavailable | Fix errors or use a current browser. This is not evidence of a live LIFF failure. |

## 14. Completion statement

After a successful rehearsal, record the preset, language, widths checked, findings disposition and demo receipt digest in the review notes. The correct conclusion remains: **no message was sent and no business state changed**. Live customer delivery remains disabled until MONOLITH Trust P0 gates pass with fresh evidence.

## Official sources

Retrieved 2026-08-02:

- [Send Flex Messages and rendering variability](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
- [Flex Message Simulator tutorial](https://developers.line.biz/en/docs/messaging-api/using-flex-message-simulator/)
- [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
- [Messaging API actions](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Adding a LIFF app](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [LIFF API reference: initialization and login](https://developers.line.biz/en/reference/liff/)
- [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/)
- [Opening a LIFF app and `liff.state`](https://developers.line.biz/en/docs/liff/opening-liff-app/)
- [LINE Login API reference: server token verification](https://developers.line.biz/en/reference/line-login/)
