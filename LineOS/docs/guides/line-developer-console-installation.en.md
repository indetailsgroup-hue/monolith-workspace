# LINE Developer Console Installation and Controlled Handoff

- Status: operator runbook; production activation remains gated
- Edition: English
- Platform facts rechecked against official LINE documentation on 2026-08-02

## Read this first

**Flex JSON is not installed in Developer Console.** The console configures channels, webhooks and LIFF app registrations. Flex JSON is a message payload: prototype it in the official **Flex Message Simulator**, validate it, then hand it to a server-side **Messaging API** integration under MONOLITH control.

This guide records configuration order without production credentials. It authorizes neither a live send nor customer delivery. Apply **no production token** to the standalone Studio, Flex JSON, LIFF client code, screenshots, source control or URLs.

Current platform note: official LINE documentation recommends LINE MINI App for new app creation as LIFF and LINE MINI App converge. This runbook implements the approved LIFF scope; re-evaluate the platform choice at the production architecture gate.

## Roles and evidence before starting

| Role | Responsibility |
|---|---|
| LINE Official Account owner | Business ID, account ownership and Manager access |
| Provider/channel admin | Provider choice, channel membership and configuration evidence |
| Security owner | Secrets, redirect allowlist, LIFF identity verification, MONOLITH transaction reference, OAuth/OIDC controls and step-up |
| Platform operator | Webhook endpoint, workers, idempotency, monitoring and rollback |
| Product owner | Trust P0 go/no-go and approved customer journey |

Record environment (`development`, `review`, `production`), accountable owner, change ticket, intended provider and rollback owner before configuration. Never reuse development identifiers as assumed production identifiers.

## Exact setup order

### 1. Register Business ID and create/select the Official Account

Register a LINE Business ID, create the LINE Official Account if needed, and confirm it in LINE Official Account Manager. Use the organization-controlled account and least-privilege admin membership; do not create a personal shadow owner.

Evidence: account display name, accountable owner and environment—without customer identifiers or secrets.

### 2. Enable Messaging API in Official Account Manager

In LINE Official Account Manager, open the intended account and enable **Messaging API**. Since 2024-09-04, a Messaging API channel is not created directly in LINE Developers Console; enabling Messaging API for the Official Account creates it. Do not instruct an operator to use “Create a Messaging API channel” in Developers Console.

### 3. Choose the provider deliberately

Select the provider that should own the service. LINE states that this provider assignment cannot later be changed or removed. When provider-scoped user identity must align, keep the Messaging API channel and LINE Login/LIFF channel under the same provider. A user receives different user IDs under different providers; provider selection is therefore an identity and tenancy decision, not a cosmetic folder choice.

Stop if the intended provider is missing or the operator lacks Admin role. Escalate ownership rather than creating a duplicate provider.

### 4. Confirm the Messaging API channel

Open LINE Developers Console, select the provider chosen in step 3, confirm the channel created for the Official Account, and record its channel ID in the controlled environment registry. Verify account/provider/channel mapping with two-person review. A channel ID is an identifier, not a secret, but still avoid uncontrolled screenshots.

### 4A. Close or govern Official Account default-message paths

Immediately open LINE Official Account Manager and inspect the Messaging API response settings. LINE documents that both settings are Enabled by default when the channel is created and can send outside MONOLITH workers.

| Setting | Required state for a closed environment | Evidence |
|---|---|---|
| Greeting messages | Disabled | Dated, redacted Official Account Manager evidence |
| Auto-reply messages | Disabled | Dated, redacted Official Account Manager evidence |

**Every environment claiming delivery closed must keep both settings Disabled.** Record environment, operator, timestamp and redacted setting view. If an approved operating model intentionally enables either setting, explicitly govern **ownership, content, audience, approval, and rollback**, test duplicate/conflicting responses, and **remove the absolute closed-delivery claim** for that environment.

### 5. Establish the secret boundary

Treat the channel secret and every channel access token as production secrets:

- store them only in the approved server-side secret manager;
- restrict read/rotate/revoke permissions and record rotation evidence;
- never put them in Flex JSON, LIFF client code, frontend environment variables, URLs, logs, screenshots, tickets or the standalone Studio;
- never send them to the browser;
- use separate credentials and identifiers per environment.

The phrase **no production token** is a release condition for every standalone artifact.

### 6. Configure and verify the webhook

1. Deploy a public HTTPS endpoint with the approved TLS configuration.
2. Preserve the raw request body and verify `x-line-signature` with HMAC-SHA256 and the channel secret before parsing. A valid signature proves transport origin/integrity, not business authorization.
3. Accept LINE’s verification POST containing `events: []` and return HTTP `200`.
4. In the Messaging API tab, enter the Webhook URL and click **Verify**.
5. Enable **Use webhook**.
6. Enable **Webhook redelivery** only after idempotent ingestion keyed by `webhookEventId` exists. Redelivery can duplicate and reorder events and is not a delivery guarantee.
7. Enable/monitor webhook error statistics and test alert routing. Acknowledge quickly, then process asynchronously.

Keep the worker’s business mutation path disabled during connectivity verification.

### 7. Create the LINE Login channel

Under the intended provider, create/select a LINE Login channel for the approved environment. Confirm provider, region, service identity, admin/tester membership and callback policy. Do not add a LIFF app to the Messaging API channel; LIFF apps belong to a LINE Login channel under this runbook.

### 8. Add the LIFF app

Open the LINE Login channel’s **LIFF** tab and select **Add**. The official UI then creates a LIFF ID and LIFF URL. Record the configuration evidence without secrets or personal user IDs.

### 9. Configure LIFF name, size and endpoint

Set:

- a service-specific app name;
- size `Compact`, `Tall` or `Full` based on the review task;
- a public HTTPS Endpoint URL with no URL fragment;
- only required scopes and options.

The endpoint must be stable for its environment. Do not hide tenant, amount, revision, bearer token or authority in the endpoint or LIFF URL.

### 10. Minimize LIFF scopes

| Scope | Select only when |
|---|---|
| `openid` | The server needs an ID token; required for `liff.getIDToken()` / decoded token. |
| `profile` | The UI genuinely needs `liff.getProfile()` or friendship data. It is not permission to mutate MONOLITH. |
| `chat_message.write` | `liff.sendMessages()` is an approved requirement. It is not required for an approval form and should otherwise stay off. |

Do not request email or other optional scopes without a defined purpose, privacy basis, retention rule and review.

### 11. Register environment-specific LIFF identifiers

Record LIFF ID and LIFF URL separately for `development`, `review` and `production`, with channel ID, provider, endpoint, scopes, owner, capture date and approval status. Treat the registry as configuration evidence. Never silently reuse a review LIFF URL in a production Flex Message.

### 12. Implement the supported LIFF identity path and separate transaction verification

Use this supported LIFF identity path before binding a LINE identity to a MONOLITH principal:

1. Execute `liff.init()` at the registered endpoint (and again after the documented external-browser redirect). In an external browser or LINE in-app browser, use `liff.login()` when login is required; LIFF browser login is handled through initialization.
2. After initialization/login, send the **raw `liff.getIDToken()` ID token or access token** to the server over HTTPS. Do not send a decoded profile as identity proof.
3. On the server, **verify using LINE's documented server flow**: verify the ID token with the expected LINE Login channel ID and documented issuer/audience/expiry/signature checks, or verify the access token and retrieve the profile from LINE as documented.
4. Map only the verified LINE subject to the stored MONOLITH principal binding, then perform tenant/resource authorization separately.

**Direct LINE Login authorization requests inside the LIFF browser are not guaranteed**; LINE instructs LIFF apps to use `liff.login()` for the in-app/external-browser LIFF login path. The documented `liff.login()` input exposes `redirectUri`, not an application-supplied OAuth `state` or OIDC `nonce` parameter.

Keep the four concepts separate:

| Concept | Meaning and required handling |
|---|---|
| MONOLITH transaction reference | A server-created, server-stored, high-entropy opaque reference with CSRF/session binding; bound to tenant, principal/audience, resource, revision, action, expiry and exact return target; one-time consumed atomically. It is not an ID-token nonce. |
| LINE-managed liff.state | Additional LIFF URL information carried by LINE; untrusted routing input; not OAuth state, not permission and not the MONOLITH transaction reference. Process routing only after `liff.init()` resolves. |
| OAuth state | CSRF correlation for a separate supported authorization flow; created and stored by that flow; not liff.state and not business permission. |
| OIDC nonce | ID-token replay/correlation input; compare only when a separate supported authorization flow lets MONOLITH supply it and LINE returns the claim. Omit the expected nonce when that flow supplied none. |

For the approved LIFF path, create the MONOLITH transaction reference in the server session before showing the exact-action review. Bind it to the verified principal/audience and all business values above, require the exact allowlisted return target, recheck authorization and revision freshness, and atomically consume it with the command/audit result. Forwarded URLs and `liff.state` can select a proposed route only; they never grant permission or select authoritative tenant/resource state.

### 13. Configure the Flex button correctly

The button in Flex JSON uses a standard URI action:

```json
{
  "type": "uri",
  "label": "Review and confirm",
  "uri": "https://liff.line.me/{environment-specific-liff-id}"
}
```

LIFF is not a distinct Flex action type. The action is `uri`; the approved LIFF URL is its destination. Do not place bearer tokens, tenant authority, amounts, roles or reusable command IDs in the URI.

The v1 standalone Studio emits an `https://example.com/monolith/demo/...` action as a deliberate demo placeholder. It is not a LIFF deployment target and must never be sent to customers. The governed server-side builder must replace it with the environment-approved LIFF entry point after Trust P0 and configuration review.

### 14. Use Flex Message Simulator for official prototyping

Copy the Studio export only after it has no blocking error. Open the official **Flex Message Simulator**, paste the exported JSON into its JSON workflow and inspect the official simulator preview. If the current simulator editor requests only a container, use the exported `contents` bubble and retain `type: flex` plus `altText` for the Messaging API message envelope.

The simulator helps prototype layout without sending. It does not deploy the message, register a template or authorize a send. Again: **Flex JSON is not installed in Developer Console.**

### 15. Test real LINE clients and fallbacks

Before any controlled send, test the approved test account matrix on current LINE for iOS, Android and desktop. Verify Thai/English wrapping, large fonts, image failure behavior, compact/tall/full LIFF, external-browser login, cancellation, expiry, stale revision, forwarded link, duplicate tap, replay, offline/timeout and a safe customer-support fallback. Record app/OS versions and date.

Do not treat the Studio preview or Flex Message Simulator as real-client equivalence.

### 16. Keep customer delivery closed until Trust P0

Live customer delivery remains disabled only when both Official Account default-message settings are Disabled and every MONOLITH Trust P0 gate has fresh evidence: tenant/principal/resource authorization, webhook signature verification before parse, replay/idempotency, secure identity binding, revision freshness, step-up for consequential action, one-time command execution, durable audit, consent/preferences, delivery reconciliation, monitoring and tested rollback. Product approval alone cannot waive a failed gate.

### 17. Roll back safely

For an unsafe release, compromise, ambiguous delivery or uncontrolled error rate:

1. In Official Account Manager, set **Greeting messages** and **Auto-reply messages** to Disabled and retain dated, redacted evidence; if either intentionally remains enabled, execute its approved owner/content/audience rollback and remove the closed-delivery claim.
2. Disable the affected command policy and new LIFF entry point.
3. Disable **Use webhook** when reception itself must stop; otherwise keep ingestion quarantined while stopping business workers.
4. Stop outbound and command workers without discarding the durable queue.
5. Revoke/rotate affected secrets when compromise is suspected.
6. Retain audit, raw evidence, request/retry identifiers and unknown-after-send state.
7. Reconcile accepted, failed, duplicate and ambiguous outcomes. Never blind resend and never delete unexplained delivery state.
8. Route users to the approved authenticated web/operator fallback.
9. Require a new Trust P0 evidence set before restoration.

Deleting the LIFF registration or event history is not the first response: preservation and reconciliation come before retirement cleanup.

## Screenshot policy

This edition contains no screenshot because no current official console screen was captured during execution. Add screenshots only when captured from the current official UI during the governed change. Every image must state capture date and environment and must redact provider/channel identifiers, user IDs, webhook paths, secrets and tokens. Never insert a simulated console image.

## Operator sign-off

| Gate | Evidence | Owner | Result |
|---|---|---|---|
| Provider/channel mapping reviewed | Registry entry and second reviewer | Channel admin | Pass/Fail |
| Greeting messages | Disabled plus dated, redacted Official Account Manager evidence; or approved governed exception with closed claim removed | OA owner | Pass/Fail |
| Auto-reply messages | Disabled plus dated, redacted Official Account Manager evidence; or approved governed exception with closed claim removed | OA owner | Pass/Fail |
| Webhook verify + empty-event 200 | Timestamped non-secret test result | Platform | Pass/Fail |
| Signature-before-parse + idempotency | Test evidence | Security/Platform | Pass/Fail |
| LIFF scopes and endpoint minimized | Configuration export/redacted capture | Security | Pass/Fail |
| LIFF identity flow | `liff.init()` / `liff.login()` plus raw-token server-verification evidence | Security | Pass/Fail |
| MONOLITH transaction reference | CSRF/session binding, exact values/return target and one-time-consume adversarial evidence | Security | Pass/Fail |
| OAuth state / OIDC nonce | Applied only to a separately documented supported flow that supplies them | Security | Pass/Fail |
| Real-client/fallback matrix | Device evidence | QA | Pass/Fail |
| Trust P0 | Signed gate record | Product + Security | Pass/Fail |
| Rollback drill | Drill record and reconciliation result | Incident owner | Pass/Fail |

Any Fail means NO-GO for live customer delivery.

## Official sources

Retrieved 2026-08-02:

- [Get started with the Messaging API](https://developers.line.biz/en/docs/messaging-api/getting-started/)
- [Build a bot and configure webhook](https://developers.line.biz/en/docs/messaging-api/building-bot/)
- [Verify webhook URL](https://developers.line.biz/en/docs/messaging-api/verify-webhook-url/)
- [Receive messages and Webhook redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [Webhook error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/)
- [Adding a LIFF app and scopes](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [LIFF API reference: initialization and login](https://developers.line.biz/en/reference/liff/)
- [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/)
- [Opening a LIFF app and `liff.state`](https://developers.line.biz/en/docs/liff/opening-liff-app/)
- [Using user profile information safely](https://developers.line.biz/en/docs/liff/using-user-profile/)
- [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/)
- [LINE Login API: server token verification and conditional ID-token nonce](https://developers.line.biz/en/reference/line-login/)
- [Flex Message Simulator tutorial](https://developers.line.biz/en/docs/messaging-api/using-flex-message-simulator/)
