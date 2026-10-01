# MONOLITH communication policy

Owner decision: 30 September 2026. Thai edition: [นโยบายการสื่อสาร](communication.th.md).

## Decision

MONOLITH uses LINE for team communication and human notifications. The owner's final decision removes the retired communication provider from the entire current file snapshot: active code, examples, generators, historical text, delivered Word documents and ZIP contents. There are no preservation exceptions. Do not restore removed content from an older conversation, template or roadmap.

Automated LINE delivery must use an authorized LINE OA integration through the Messaging API. A chosen channel is not evidence of a working integration. Verify recipients, access, delivery and failure handling before claiming activation. Do not create a new sender or send test messages merely to replace a retired workflow; coordinate with the existing LINE OA work. This removal does not retire unrelated Email, Teams or PagerDuty contracts.

## Source inventory and known gaps — 30 September 2026

This dated inventory covers outbound LINE message senders in [monolith-workspace at 14ec24bc](https://github.com/indetailsgroup-hue/monolith-workspace/tree/14ec24bcb1186914893dd7aa43448c9a794fe15c). It is a source snapshot, not a live status report or evidence of deployment or successful delivery. It excludes email delivery, authentication, token renewal and media ingestion integrations such as line-login, line-token-refresh, capture-media-worker and customer-design-view.

| Component under supabase/functions | Source evidence | Assessment |
|---|---|---|
| notify-overdue/index.ts | Line 112 calls notify-api.line.me/api/notify | Legacy LINE Notify; conflicts with the required Messaging API policy; remediation pending |
| etax-risk-notify/index.ts | Line 61 calls notify-api.line.me/api/notify | Same legacy gap; remediation pending |
| field-purchase-line/index.ts | Lines 267 and 283 call Messaging API reply/push | Sender implementation exists; live delivery not verified here |
| notification-retry-worker/index.ts | Line 204 calls Messaging API push | Sender implementation exists; live delivery not verified here |
| line-outbound-sender/index.ts | Line 527 defines the Messaging API message endpoint | Sender implementation exists; live delivery not verified here |
| line-oa-dispatch-worker/index.ts | Lines 155–183 implement the Messaging API request | Sender implementation exists; live delivery not verified here |
| GitHub deployment notification | No LINE deployment sender in the inspected workflows | After retiring the old workflow, there is no automated deploy notification channel in this workflow set; inspect GitHub Actions directly |

LINE Notify ended on 31 March 2025; its APIs are unavailable. The two legacy calls above are not valid alternatives to LINE OA. [Official LINE announcement](https://developers.line.biz/en/news/2025/04/01/line-notify/).

When updating the inventory, identify the repository and source revision inspected. Workspaces with separate governance and product repositories require both to be checked; findings from one checkout must not be generalized to the whole product. Source presence and passing tests alone do not establish live delivery.

## Removal and prevention

The change removes the old deployment notification workflow and its CI, test and README references. Current roadmap, alert examples, onboarding material and document generators use the selected channel and identify unimplemented delivery as a requirement. Historical conversation lines containing the retired provider are replaced with an explicit removal notice; they are no longer verbatim archives. The archive index names the six revised chats, and its checksum file is regenerated for the revised files; the source hashes and counts in its manifest describe the capture before removal. This does not fabricate historical LINE delivery evidence. Unrelated content remains.

The owner rejected retaining the old migration comment, original Word/ZIP communication content and original generator wording. The removal in migration 0180 therefore remains. Even a comment-only change under `supabase/migrations/**` matches ci.yml's push filter and can lead from production schema reconciliation to Edge Function deployment when its gates pass. Review that impact before merging; this change is not deploy-free.

The existing required Validate Site Files check runs the communication policy guard on every PR to main. It scans tracked and non-ignored new regular files, filenames, raw ASCII/UTF-8 and UTF-16 LE/BE bytes, including content after NUL bytes. It also inspects ZIP/Office members recursively, member names, comments and XML/HTML displayed text, including split text runs and entities. It reports locations, never matching content or secret values.

Office owner-lock files named with the `~$` prefix contain binary owner records rather than workbooks; their names and raw contents are scanned, and ZIP payloads are still inspected if present. No exception manifest is accepted. Reintroducing the former manifest fails the check. The prohibited identifier is assembled from code points in the checker and its tests, so their source needs no content exception. Unreadable or encrypted archives and archive resource limits fail instead of being skipped: eight archive levels, 128 MiB expanded content and 10,000 file members per top-level file.

Counts distinguish regular files, inspected archive members, raw payloads and skipped non-regular paths. Symlink targets, submodules, nested repositories, ignored files, Git history and image OCR are outside this scan. Other encodings and computed strings still require review. PASS establishes the stated content checks, not an exhaustive semantic audit or proof about other repositories. Git inventory errors return a nonzero exit status.

Run locally:

```bash
python tools/check_communication_policy.py
python -m unittest discover -s tests/docs -v
python -m scripts.docs.site_data
```

## Delivered documents and archives

The 30 September 2026 removal updates the eight files below in place, including six Word copies nested in the SOP package. No original-content backup is created. Existing filenames containing “backup” are also cleaned; their names do not grant an exception. The accepted edition is revised, not treated as an untouched historical artifact. Current generators and their packaged copies retain the revised activation requirements.

| File | Removal scope |
|---|---|
| monolith/monolith_project_summary_v25_accepted.docx | Main document text; bilingual revision notice |
| monolith/monolith_project_summary_v25_accepted_pre_accept_s56_backup.docx | Same treatment |
| monolith/monolith_project_summary_v25_accepted_pre_accept_s57_backup.docx | Same treatment |
| monolith/monolith_project_summary_v25_accepted_pre_accept_s58_backup.docx | Same treatment |
| monolith/monolith_project_summary_v25_accepted_pre_s57_backup.docx | Same treatment |
| monolith/monolith_project_summary_v25_accepted_pre_s58_backup.docx | Same treatment |
| MONOLITH_SOP_Package_v2.5.zip | Three HTML members |
| monolith/MONOLITH_SOP_Package_v2.5.zip | Two Python generators, two HTML members and six nested Word documents |

LINE wording in these documents specifies authorization and verified delivery before activation. It is not a statement that LINE was historically live or that delivery has been demonstrated. The revised Word XML also escapes previously malformed text-node characters without changing their displayed text. ZIP integrity and XML validation do not establish visual layout; a rendered Word review remains a separate check when a supported renderer is available.

## Release boundary

The old deployment-notification workflow was manually disabled on GitHub on 30 September 2026. Repository workflow removal takes effect through the reviewed release process. This policy does not activate a LINE deployment sender; operators must inspect GitHub Actions directly until a replacement has delivery evidence. This patch does not rewrite Git history or remote workflow records. Repository or environment secrets, if any, require an authenticated inventory by name; no secret value is needed. The guard does not query credential stores or print matching values.
