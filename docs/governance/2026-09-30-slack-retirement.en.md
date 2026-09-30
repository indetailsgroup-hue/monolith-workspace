# Slack retirement for deployment automation

Date: 30 September 2026. Owner direction: remove Slack entirely from this project's deployment notifications.

## Scope and changes

This patch is based on governance repository main at `14ec24bc`. The nested product repository and its LINE OA Phase A work are separate and are not modified.

Remove `notify-slack-deploy.yml`, its documentation badge, and its CI/test references. This patch uses the current main workflow inventory rather than old checkouts. Deployment results remain available in GitHub Actions.

`tests/docs/test_notification_policy.py` rejects Slack references in every workflow, local action, documentation automation helper and the site README. The existing required documentation CI runs this test on every pull request. Do not restore a sender, webhook configuration or Slack action from an older branch. Historical conversation archives remain evidence, not active configuration.

## Separate LINE work

PR #123 proposes LINE deployment notifications and is still a draft. Removing Slack does not depend on completing that work and does not enable LINE messaging. Any future LINE deployment notifier must preserve this retirement policy. No customer-facing LINE OA code is changed.

## Verification and activation

The new policy test fails against the original sender and passes after removal. Run the documentation regression suite with `python -m unittest discover -s tests/docs -v` after installing `scripts/docs/requirements.txt`.

This source change takes effect on GitHub after merge to main. No external messages were sent. Repository, environment and organization secrets and already-running workflow jobs are not changed by deleting source files; their live state is not established by these local tests.
