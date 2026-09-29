# Flex Action vs LIFF Decision Guide

- Status: approved decision contract for MONOLITH LINE Human Surface
- Edition: English
- Official platform behavior checked 2026-08-02

## 1. Decision principle

Choose an action by consequence, not by which button looks simplest. LINE is the Human Surface; MONOLITH remains the authority for tenant, identity, permission, resource, revision, workflow and audit.

A Flex button supports LINE action objects. LIFF is opened through a Flex **URI action**; LIFF is not a separate Flex action type. A URI opening LIFF provides a private review surface, but the server must still authenticate, authorize, bind the exact transaction and recheck current state.

No action payload is permission. No production token belongs in action data or a URL.

## 2. Exact approved matrix

| Need | Action |
|---|---|
| Visible conversational text | Message |
| Low-risk reversible choice, reauthorized server-side | Postback with opaque intent ID |
| Read-only web/tel/LINE scheme | URI |
| Form, identity, sensitive detail, comparison or explicit confirmation | URI opening LIFF |
| Money, access, release, policy, scope or hard-to-reverse change | LIFF plus MONOLITH step-up |

Apply the highest-consequence row that could result from the control. If a button mixes acknowledgement and approval, split the journey so the card acknowledges first and the authenticated work surface authorizes separately.

## 3. What each action actually does

### Message

A Message action sends its configured text into the chat as a message from the user. Use it only when visible conversational text is itself the intended outcome—for example, “Please contact me.” Free text is not a structured order, approval, identity binding or workflow mutation.

### Postback

A Postback action sends a postback event to the webhook with the configured `data`. Use a short opaque intent ID that resolves to a server-side record. On receipt, verify webhook signature, map the actor, resolve tenant/resource from authoritative context, reauthorize, enforce expiry and idempotency, then perform only the low-risk reversible operation declared by policy.

### URI

A URI action opens `http`, `https`, `line` or `tel` destinations supported by LINE. Use it for read-only pages, phone calls and approved LINE schemes. Treat every query value as untrusted. A read-only destination must not mutate state on GET.

### URI opening LIFF

Use a URI action whose destination is the environment-approved LIFF URL. LIFF provides a private surface for forms, sensitive details, comparisons and explicit confirmation; login is only the first identity step and never business authorization.

Supported identity sequence: run `liff.init()`; use `liff.login()` in the documented external/in-app-browser case; send the **raw `liff.getIDToken()` ID token or access token** to the server; then **verify using LINE's documented server flow** before mapping the verified subject to a stored principal. **Direct LINE Login authorization requests inside the LIFF browser are not guaranteed**; preserve LINE's `liff.login()` path instead of constructing an authorization request inside LIFF.

Keep identity, routing and transaction values separate:

| Concept | Meaning and required handling |
|---|---|
| MONOLITH transaction reference | A server-created, server-stored, high-entropy opaque reference with CSRF/session binding; bound to tenant, principal/audience, resource, revision, action, expiry and exact return target; one-time consumed atomically. It is not an ID-token nonce. |
| LINE-managed liff.state | Additional LIFF URL information carried by LINE; untrusted routing input; not OAuth state, not permission and not the MONOLITH transaction reference. |
| OAuth state | CSRF correlation for a separate supported authorization flow; created/stored by that flow; not liff.state and not business permission. |
| OIDC nonce | ID-token replay/correlation input; compare only when a separate supported authorization flow lets MONOLITH supply it and LINE returns the ID-token claim. |

### LIFF plus MONOLITH step-up

For money, access, release, policy, scope or a hard-to-reverse change, LIFF must call the MONOLITH authorization path. Re-read authoritative data, explain consequence, require appropriate step-up/two-person control, atomically consume a one-time command and return a durable Signed Receipt. A successful LIFF login alone does not approve the action.

## 4. Preset decisions

| Preset | Primary control | Why | Server-side result |
|---|---|---|---|
| `design-approval` | URI opening LIFF, then MONOLITH step-up | The exact design revision affects release and downstream work | Load authoritative revision; verify signer scope and freshness; one-time approve/reject; durable receipt. |
| `quote-order` | URI opening LIFF, then MONOLITH step-up | Price, scope, tax/terms and order intent must be compared and confirmed | Reprice/reload quote; verify customer/project and current terms; create structured order intent once. |
| `sla-escalation` | Postback with opaque intent ID for acknowledgement; URI for “Open work item” | Acknowledgement is low-risk, while monetary approval is consequential | Record acknowledgement idempotently; route approval to authenticated work item with permission/limit check. |
| `site-update` | Read-only URI | The customer views an evidence set already curated for its audience | Resolve a short-lived audience-scoped view; log access if policy requires; no workflow mutation on open. |
| `issue-evidence` | Postback with opaque intent ID | Acknowledgement is reversible; promote/reject needs actor/project verification | Mark “review requested” once; keep evidence quarantined until authorized human review. |

Secondary buttons must not create a hidden alternative approval route. Use one dominant CTA and a clearly lower-consequence fallback.

## 5. Duplicate, replay and retry behavior

LINE webhook redelivery and network/client retries can produce duplicate events, and redelivery order can differ from occurrence order. Design every route for at-least-once observations:

1. Verify `x-line-signature` over the exact raw body before parsing.
2. Deduplicate inbound webhooks with `webhookEventId`; retain the first processing result.
3. Resolve opaque intent ID to a server record bound to tenant, actor/audience, resource, revision, action, expiry and permitted use count.
4. Reject expired, already-consumed, mismatched or stale intents. A replay returns the prior safe result or an explicit rejection; it never repeats the business command.
5. Use an atomic idempotency/command key around the business mutation and its audit record.
6. Distinguish duplicate delivery from `unknown-after-send`. For an ambiguous outbound result, preserve request/retry identifiers and acceptance state, reconcile outcome and never blind resend.

Do not use the LINE reply token as the only business idempotency key. Do not assume event order is authoritative workflow order.

## 6. Transport proof is not authorization

A valid webhook signature proves that the received raw body was signed with the channel secret and was not altered in transit. It establishes transport authenticity/integrity. It does **not** prove that:

- the LINE user is bound to the intended MONOLITH principal;
- the actor belongs to the tenant or may act on the resource;
- the action is allowed by role, limit, policy or separation of duties;
- the referenced revision is current;
- a group participant is known or authorized;
- the command has not expired or already executed.

Therefore signature verification is the first ingress gate, followed by identity binding, tenant/resource resolution, policy authorization, freshness, idempotency and audit.

## 7. Data contracts

### Safe postback shape

```json
{
  "type": "postback",
  "label": "Acknowledge SLA",
  "data": "intent=it_7mF2kQp9"
}
```

The opaque value has no standalone meaning. The server record—not `data`—contains tenant, resource, revision, allowed action, risk, expiry and one-time status.

### Safe LIFF URI shape

```json
{
  "type": "uri",
  "label": "Review and confirm",
  "uri": "https://liff.line.me/{environment-liff-id}"
}
```

Create the MONOLITH transaction reference server-side after entry and bind it to the authenticated session plus exact return target. Avoid readable or reusable business authority in the URI. `liff.state` and forwarded URL values can propose routing only; the server reloads tenant/resource/revision/action and authorization before one-time consumption.

## 8. Prohibited anti-patterns

| Anti-pattern | Why it fails | Required replacement |
|---|---|---|
| tenant/amount/role in postback data | User-controlled/forwardable payload becomes apparent authority and leaks context | Opaque intent ID; authoritative server lookup and reauthorization |
| free-text order truth | Text is ambiguous, editable in process and lacks schema/revision binding | Structured order form in LIFF plus authoritative quote reload |
| one-tap approval | No exact-value review, freshness check, step-up or consequence acknowledgement | LIFF review plus MONOLITH step-up and one-time command |
| bearer tokens in URLs | URLs leak through logs, history, referrers, screenshots and forwarding | Server session, secure cookie/token exchange and opaque one-time reference |
| group membership as permission | Group actor may be unbound, membership changes and everyone sees the message | Bind principal explicitly; resolve tenant/resource authorization server-side |

Also prohibited: state-changing GET, reusable command ID, trusting LIFF-decoded client profile, auto-promoting group evidence, hidden secondary approval CTA and treating message acceptance as human receipt.

## 9. Review checklist

- [ ] The business need maps to exactly one row of the approved matrix.
- [ ] Consequential actions use URI opening LIFF plus MONOLITH step-up.
- [ ] Postback contains only an opaque, expiring intent ID.
- [ ] Message action is conversational text only.
- [ ] Read-only URI does not mutate on GET and contains no secret.
- [ ] Webhook signature is verified before parse, then authorization occurs separately.
- [ ] Tenant, principal, resource, revision and policy come from authoritative server state.
- [ ] Duplicate/replay/expiry/stale/forwarded-link tests fail safely.
- [ ] One-time command and audit are atomic.
- [ ] `unknown-after-send` is reconciled without blind resend.
- [ ] Live delivery remains closed until Trust P0 passes.
- [ ] LIFF uses `liff.init()` / `liff.login()` and raw-token server verification; decoded client profile is not identity proof.
- [ ] MONOLITH transaction reference, LINE-managed `liff.state`, OAuth state and OIDC nonce remain separate.

## Official sources

Retrieved 2026-08-02:

- [Messaging API action objects](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Messaging API reference: Message, Postback and URI actions](https://developers.line.biz/en/reference/messaging-api/nojs/)
- [Receive messages and webhook redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [Adding a LIFF app and scopes](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [LIFF API reference: initialization and login](https://developers.line.biz/en/reference/liff/)
- [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/)
- [Opening a LIFF app and `liff.state`](https://developers.line.biz/en/docs/liff/opening-liff-app/)
- [Using profile information in LIFF safely](https://developers.line.biz/en/docs/liff/using-user-profile/)
- [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/)
- [LINE Login API: token and nonce verification](https://developers.line.biz/en/reference/line-login/)
- [Retrying a Messaging API request](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
