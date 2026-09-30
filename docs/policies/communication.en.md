# MONOLITH communication policy

Owner decision: 30 September 2026. Thai edition: [นโยบายการสื่อสาร](communication.th.md).

## Decision

MONOLITH uses LINE for team communication and human notifications. Slack is retired from active integrations, examples, generators and recommendations. Do not restore it when following an old conversation, template or roadmap.

Automated delivery uses an authorized LINE OA integration through the Messaging API. A chosen channel is not evidence of a working integration. Verify recipients, access, delivery and failure handling before claiming activation. Do not create a new sender or send test messages merely to replace a retired workflow; coordinate with the existing LINE OA work.

## Removal and prevention

The change removes the deployment notification workflow and its CI, test and README references. Current roadmap, alert examples, onboarding material and document generators use the selected channel and identify unimplemented delivery as a proposal. The SQL migration edit changes comments only; it does not change database behavior or run a migration.

The existing required Validate Site Files check runs the communication policy guard on every PR to main. It scans tracked files and non-ignored new files, including workflow names, dependencies, source, templates, Markdown, HTML and generated JSON. It reports only file locations, never matching secret values.

Run locally:

```bash
python tools/check_communication_policy.py
python -m unittest discover -s tests/docs -v
python -m scripts.docs.site_data
```

## Preserved evidence

Old conversation exports and dated audit/implementation records remain unchanged as historical evidence. They do not authorize current integration choices. Engineering uses of the word “slack” refer to mechanical or numerical tolerance and are unrelated to communication.

These records, the policy itself and negative test examples have explicit exceptions in tools/communication_policy_exceptions.json. Each exception records its purpose and SHA-256 of the file after CRLF-to-LF normalization. There are no directory-wide exclusions: a new file, copied example or modified exempt file containing the retired provider fails the guard. Review the actual change before updating an exception; never add a live integration to the exceptions.

## Release boundary

Local removal takes effect on GitHub only after the change is signed, pushed, reviewed and merged. No LINE deployment notification is claimed or enabled by this change. Existing remote workflow records and Git history remain historical records. Repository or environment secrets, if any, require a separate authenticated inventory by name; no secret value is needed and no credential is read by this guard.
