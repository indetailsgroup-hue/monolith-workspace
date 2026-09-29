# Flex Message Performance and Rendering Checklist

- Status: release checklist for the v1 standalone authoring scope
- Edition: English
- Official LINE limits rechecked 2026-08-02

## 1. Release rule

Run this checklist for every preset, language and material content change. The Studio preview is a local approximation; only the exported HTTPS assets, official simulator and real LINE clients exercise the delivery rendering path. A visual pass never overrides validation, security, authorization or Trust P0.

The v1 Studio authors **one bubble only**. It does not authorize carousel composition or live delivery.

The required failure matrix covers unavailable image, LINE API 4xx/429/5xx, duplicate delivery and `unknown-after-send`.

## 2. Payload ceilings and budget

| Item | LINE ceiling | MONOLITH release rule |
|---|---|---|
| Flex bubble definition | **30 KB** JSON | Target at or below **24 KB**; above 24 KB is warning, above 30 KB blocks. |
| Flex carousel definition | **50 KB** JSON | Out of v1 authoring scope; design review required. |
| Carousel bubbles | Maximum **12** | v1 Studio authors one bubble only. |
| Flex `altText` | **1,500** characters | Required, meaningful in Thai/English, and tested in notifications/chat list. |

Measure UTF-8 bytes on the exact `contents` object that will be sent. Do not assume character count equals byte count, especially for Thai and emoji. Stay below the hard ceiling with margin because copy and URL changes grow the payload.

- [ ] Bubble size ≤ 24 KB soft budget.
- [ ] Any 24–30 KB exception is documented with an owner and reduction plan.
- [ ] Export is blocked above 30 KB.
- [ ] `altText` is present, accurate and ≤ 1,500 characters.
- [ ] No unused components, duplicate styles or decorative nesting.

## 3. Image acceptance

For Flex image components, use an **HTTPS** URL with supported **JPEG or PNG** content. The official acceptance ceilings are **1024×1024** pixels and **10 MB** per image; LINE recommends keeping individual images at 1 MB or less to avoid display delay. These are acceptance ceilings, not a performance target.

- [ ] Protocol is HTTPS with supported TLS; redirect chain also remains HTTPS.
- [ ] MIME/content is the expected JPEG/PNG and not an HTML error page.
- [ ] Dimensions are no greater than 1024×1024.
- [ ] File is no greater than 10 MB and production target is substantially smaller (normally ≤ 1 MB).
- [ ] URL is percent-encoded where required, stable for the message lifetime and contains no token/secret.
- [ ] Cache policy and content replacement behavior are reviewed.
- [ ] Broken/unavailable image leaves essential meaning and CTA understandable.

The standalone bundle uses **no base64**, no remote fonts and no third-party runtime. Preserve this boundary: base64 expands payloads, remote fonts introduce availability/privacy/rendering drift, and third-party runtime makes a local safety artifact dependent on external code.

## 4. Local preview versus exported URL

The Studio’s Hero preview uses a bundled local SVG from `LineOS/assets/line-flex-studio/`. The generated JSON uses the Hero **Export HTTPS URL** instead. A correct local picture does not prove the exported URL exists, serves the right bytes or works from LINE.

- [ ] Inspect the generated `hero.url`; do not infer it from the local preview.
- [ ] Open the HTTPS asset from an environment outside the developer machine.
- [ ] Confirm status, content type, dimensions, file size, certificate and redirect behavior.
- [ ] Paste the payload into Flex Message Simulator.
- [ ] Test the exported asset in real LINE clients and under poor network conditions.

## 5. Width, language and font matrix

Inspect at **320**, **360** and **390** CSS-pixel viewport widths. For each width, complete:

| Case | Pass condition |
|---|---|
| Thai | Natural wrapping; no clipped vowel/tone marks; facts remain associated with labels. |
| English | Long words and names wrap without overflow; CTA remains visible. |
| Emoji/symbols | Emoji, currency, percent, en dash and bullets render without replacement boxes. |
| Long name | Project, customer and requester names wrap without obscuring revision/deadline. |
| Large font | Current device large-font setting does not overlap, crop or hide action meaning. |

Do not force copy to match one screenshot. LINE states that OS, LINE version, resolution, language and font affect Flex rendering.

## 6. Hero crop and safe visual area

- [ ] Test `cover` cropping at every width and on tall/wide source variants.
- [ ] Keep the focal subject inside a centered safe visual area with generous edge margin.
- [ ] Do not bake revision, price, deadline, approval consequence or other essential text into the image.
- [ ] Put essential text in Flex text components and in useful `altText`.
- [ ] Check face/material/product crops, logos and contrast after crop.
- [ ] Verify the card remains understandable when the image is unavailable.

`cover` may remove source-image edges by design. Approval truth must remain outside the image.

## 7. Layout resilience

- [ ] Keep layout shallow; remove containers used only for decoration.
- [ ] Set important text to wrap and tolerate one or more additional lines.
- [ ] Avoid fixed heights for text-bearing containers; fixed height can clip translated or enlarged text.
- [ ] Do not align facts by inserting spaces or hard-coded line breaks.
- [ ] Use consistent spacing, concise labels and sufficient touch targets.
- [ ] Test missing optional text and longest allowed text.
- [ ] Verify fallback for client features whose support depends on LINE version.

## 8. Primary CTA clarity

- [ ] One primary CTA is visually dominant.
- [ ] Label states what opens or happens: “Review and confirm,” not “OK.”
- [ ] Trust note explains that consequential state changes only after private confirmation.
- [ ] Secondary route has lower consequence and cannot bypass the primary review.
- [ ] Action matches the approved Message/Postback/URI/LIFF matrix.
- [ ] High-risk action opens LIFF and requires MONOLITH step-up.

## 9. Accessibility and motion

- [ ] Entire Studio and review journey works with keyboard only.
- [ ] Tab order follows reading order; focus is visible and returns to the trigger after dialogs.
- [ ] Header/Hero/Body/Footer and mobile pane tabs support arrows, Home and End.
- [ ] Contrast is sufficient in normal, disabled, warning and error states.
- [ ] Controls have semantic labels and validation connects a rule to the affected field.
- [ ] Meaning is not conveyed by color, image or animation alone.
- [ ] `altText` conveys the actionable summary.
- [ ] Reduced-motion preference is respected; avoid essential animation.
- [ ] Screen-reader reading order and large font are checked on real devices.

## 10. Real-device matrix

Use organization-controlled test accounts and record the exact date, OS, device class and current installed LINE version across iOS, Android and desktop. “Latest” without a version/date is not evidence.

| Client | Minimum cases |
|---|---|
| iOS LINE | 320/390-class width, normal/large font, Thai/English, image available/unavailable, LIFF open/cancel/confirm |
| Android LINE | 360/390-class width, normal/large font, Thai/English, image available/unavailable, LIFF open/cancel/confirm |
| Desktop LINE (Windows/macOS as supported) | Window narrow/wide, URI fallback, keyboard, unsupported-feature fallback |
| External browser from LIFF path | Login, exact redirect, cancellation, stale/expired transaction and support fallback |

Retest after material Flex changes, image/CDN changes, LIFF SDK/platform changes and meaningful LINE client updates.

## 11. Media delivery

**Future production guidance** — not evidence of a deployed CDN:

- use an approved first-party media host/CDN with HTTPS, monitored availability and explicit owner;
- publish immutable, content-addressed or versioned asset URLs so an approved message does not silently change;
- avoid signed URLs that expire before message retention/use; never embed bearer credentials;
- optimize JPEG/PNG dimensions and quality before upload; do not rely on CDN transformation at view time without a pinned contract;
- set correct content type, cache headers and safe redirects;
- monitor origin/CDN errors and latency, and keep an accessible text fallback;
- define takedown, privacy, retention and incident procedures.

Production host, SLA, region and retention remain architecture decisions. Revalidate them at release.

## 12. Failure and recovery checks

### Unavailable image

- [ ] Simulate DNS failure, 404/403, slow response and wrong MIME.
- [ ] Essential text and CTA remain outside the image.
- [ ] Operator can replace/version the asset without rewriting historical evidence.

### LINE API `4xx`

- [ ] Treat validation/auth/recipient errors as terminal until classified; do not blind retry.
- [ ] Preserve non-secret request ID, payload hash, error body and environment for audit.
- [ ] Quarantine invalid payloads and return them to the owner.

### LINE API `429`

- [ ] Honor platform rate constraints and controlled backoff/queue policy.
- [ ] Do not multiply retries across workers.
- [ ] Monitor queue age, tenant fairness and SLA impact.

### LINE API `5xx` or timeout

- [ ] Use LINE retry-key semantics only where officially supported and retain the same retry key for the same request.
- [ ] Bound retries with backoff and a circuit/incident threshold.
- [ ] Do not equate API acceptance with human receipt.

### Duplicate delivery

- [ ] Deduplicate inbound events by `webhookEventId` and business commands by stable idempotency key.
- [ ] Replayed action returns the stored safe result and never repeats a state transition.

### `unknown-after-send`

- [ ] Persist request ID, retry key, payload hash, target reference and acceptance state before send.
- [ ] Mark ambiguous outcome explicitly, stop blind resend and reconcile through platform evidence/operator review.
- [ ] Escalate unresolved ambiguity; preserve the queue and audit trail.

## 13. Release evidence record

| Evidence | Required value |
|---|---|
| Payload | Preset/revision, JSON hash, UTF-8 byte count, alt-text length |
| Visual | 320/360/390 captures for TH/EN, large font and image failure |
| Official simulation | Flex Message Simulator date/result |
| Devices | OS, device, LINE version, environment and tester |
| Accessibility | Keyboard/focus/contrast/labels/reduced-motion result |
| Failure | Image, `4xx`, `429`, `5xx`, timeout, duplicate, replay and unknown-after-send evidence |
| Authorization | Action decision, Trust P0 gate and step-up evidence where applicable |
| Rollback | Owner, disable path, worker stop and reconciliation drill |

Any hard-limit breach, hidden essential image text, unclear primary CTA, missing real-device evidence, failed accessibility condition or unresolved consequential-action gate means NO-GO.

## Official sources

Retrieved 2026-08-02:

- [Messaging API reference: Flex, carousel, alt text and image constraints](https://developers.line.biz/en/reference/messaging-api/nojs/)
- [Send Flex Messages and rendering variability](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
- [Flex Message Simulator image requirements](https://developers.line.biz/en/docs/messaging-api/using-flex-message-simulator/)
- [Flex Message layout](https://developers.line.biz/en/docs/messaging-api/flex-message-layout/)
- [Receive messages and webhook duplicates](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [Retrying a Messaging API request](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [Messaging API status codes](https://developers.line.biz/en/reference/messaging-api/nojs/#status-codes)
