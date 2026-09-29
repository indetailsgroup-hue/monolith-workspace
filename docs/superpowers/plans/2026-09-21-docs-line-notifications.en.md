# Deployment notification contract — LINE

Owner decision on 21 September 2026: use LINE for documentation deployment notifications. This replaces the original audit's Slack workflow and Slack curl requirements. Generator/Changelog publication remains through reviewed PRs (PR #122 merged as fbaf046a1c54299a7fa4c9144a65b877e98a19fc).

## Implementation and verification plan

1. Replace notify-slack-deploy.yml with notify-line-deploy.yml; watch both existing Pages deployment workflow names. Remove the inline Slack sender from Auto-Deploy SciSpace Site to keep one notification path per completed workflow run. Update the badge and docs CI selectors.
2. Use the LINE Messaging API push endpoint, the existing LINE_MONOLITH_CHANNEL_ACCESS_TOKEN secret name and a dedicated LINE_DEPLOY_RECIPIENT_ID secret. Send one Thai/English text message containing workflow result, source workflow SHA and run link. These are workflow results, not an attestation of deployed bytes or SciSpace publication. A successful workflow may include skipped deployment jobs.
3. Test missing configuration, Unicode/JSON content, stable retry keys, duplicate receipt, HTTP and network failures without live messages. Review the change, create a PR and inspect actual CI before owner merge.

## Configuration and operation

- Set repository Actions secret LINE_MONOLITH_CHANNEL_ACCESS_TOKEN to the intended LINE Official Account channel access token. This name is already referenced by .github/workflows/ci.yml; that does not prove the secret is configured or valid.
- Set LINE_DEPLOY_RECIPIENT_ID to the owner's approved user/group/room ID. No recipient is inferred from product data. Keep token and recipient values out of source and chat. Bot membership/friendship and channel permissions must support that destination.
- A completed main-branch workflow from this repository triggers the notifier. The notifier checks out trusted main, has contents:read only, and takes event data through environment variables rather than shell interpolation.
- Missing token or recipient produces a visible warning and SKIPPED summary without an HTTP request. HTTP/network errors fail the notification job independently of the completed deployment.
- HTTP 200 means LINE accepted the request, not recipient delivery. A 409 is accepted only with x-line-accepted-request-id. The deterministic retry key uses repository, source run ID, conclusion, recipient and exact payload; retry protection lasts 24 hours under the LINE API contract. A rerun with the same result intentionally avoids another notification within that period.
- Live delivery is pending destination configuration and an authorized recipient receipt check. No live LINE message was sent during implementation.

## Related post-merge finding

Generator run [35597895466](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/35597895466) created signed commit 408469f3e294af6933f1de59cbd404fb307633a8 on codex/automated-site-data, then GitHub rejected PR creation because Actions is not permitted to create or approve PRs. The owner must decide the repository permission separately; branch protection remains enabled. Changelog was not triggered by PR #122 because that merge changed workflows rather than site files.

Scope: documentation workflows in the isolated governance repository worktree based on fbaf046a1. The nested product repository remains unchanged by this work. Existing reports are historical evidence; the new notification requirement supersedes their Slack recommendations.

Reference: [LINE Messaging API — push messages](https://developers.line.biz/en/reference/messaging-api/#send-push-message).
