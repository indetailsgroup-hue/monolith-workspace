# Team Pulse interface — design and implementation plan

**Date:** 12 September 2026
**Scope:** Approved C-05 interface slice, isolated product checkout. Parent governance root and nested product worktree remain separate and preserved.
**Goal:** Let administrators manage pulse sessions and authenticated members answer an active session through the existing Culture Metrics dashboard.

## Chosen design

Add a Team Pulse tab alongside Surveys and Sentiment. A separate route would duplicate navigation; embedding the form inside the existing survey panel would mix two session models. The tab keeps the existing Thai interface and module plan gate.

TeamPulseBoard accepts orgId, plan, isAdmin and optional userId. A keyed inner panel resets local state on organization, plan, role or user changes. It hides cached content on the first render before its effect resets the store context. Initial loading calls setContext(orgId, plan), fetchSessions, and admin-only fetchSummary. Cleanup calls setContext(null, null). Late action results cannot show success in a new identity context.

Administrators enter a title and period label to create a DRAFT, activate DRAFT sessions, close ACTIVE sessions, and view the selected session's topic summaries. Members see only ACTIVE/CLOSED sessions and answer only ACTIVE sessions using one of the existing five topics, an integer score from 1 to 5, and an optional comment. No config editor or config read permission is added.

The store's boolean result controls confirmation: retain form values on false; clear only after true. Use returned database session state. Refresh sessions for retry and admin summaries after confirmed response/close. Show pending, error, empty and closed-session states. Validate whitespace-only titles/periods and invalid scores before sending.

Responses do not store a user ID, but authentication and organization membership still apply. Free text may identify a person. Do not promise anonymity or one response per person. Existing summary behavior remains: health status is null below three responses, while average and count remain displayed to administrators.

## Implementation and verification

- [x] Add TeamPulseBoard and component tests for admin/member visibility, gates, form validation, failed writes, lifecycle calls, identity changes and late completions.
- [x] Add restore-safe Storybook fixtures for admin, member, closed/empty and gated states, with a submit interaction.
- [x] Add the dashboard tab and forward optional userId from the existing authenticated route context.
- [x] Run focused component/store/dashboard tests, TypeScript and scoped lint.
- [x] Inspect all six rendered Storybook scenarios in the local browser, including the completed member submission interaction.

**Files:** src/culture-metrics/TeamPulseBoard.tsx, TeamPulseBoard.stories.tsx, __tests__/TeamPulseBoard.test.tsx, and narrow CultureDashboard.tsx/test integration.

**Stack:** existing React 18, Zustand, Tailwind, Vitest and Storybook; no new dependency.

## Implementation evidence

The focused suite passes 137 tests across four files: 24 board tests, one portable Storybook interaction, 48 dashboard tests and 64 store tests. The Storybook interaction also passes after restoreAllMocks. Full source TypeScript passes; the four new UI files pass lint with zero warnings. Git diff whitespace validation passes.

The identity regressions cover organization, plan, role, user, and combined role/user replacement. A mounted test resolves an old real-store administrator summary query after the role changes and confirms that neither the cache nor the page receives it. A separate user-only replacement preserves the same organization, plan and role while checking that old inputs, results and delayed success messages disappear.

The read-only review found no implementation blocker and requested the independent user-only regression described above. Browser fixtures are synthetic. Hosted visual verification, CI and deployment are separate acceptance steps.

The first local browser inspection found low contrast when the host inherited a dark theme: white cards inherited white text and native form controls inherited dark styling. Team Pulse now defines its own light surface, dark foreground and explicit input colors, with native color-scheme scoped to the board. The root agent reinspected administrator and member screenshots and confirmed readable labels, inputs and cards after this correction.

Local browser verification covered all six stories: administrator, member, closed session, empty sessions, plan gate and member submission. The member view had no administrator summary; the closed session had no response form; empty and gated messages appeared. The submission interaction displayed success, cleared the comment and retained zero administrator summary elements. These checks used synthetic fixtures and did not send real responses.

**Acceptance boundary:** UI and store tests establish client behavior. Database RLS, fresh migration verification, CI and final integration are tracked separately by the root agent. This note does not claim deployment or production readiness.
