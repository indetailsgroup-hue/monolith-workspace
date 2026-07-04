---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADRs and glossary) as we go. Use only when the user explicitly asks to "grill with docs" or stress-test a plan against the project's documented language and decisions.
---

# Grill With Docs

> Source: adapted from [mattpocock/skills — skills/engineering/grill-with-docs](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md), composing the `grilling` and `domain-modeling` skills. Original authorship credited.
>
> **Manual trigger only.** Do not invoke automatically — only when the user explicitly requests a docs-anchored grilling session.

Run a relentless `grilling` interview to sharpen the plan, while simultaneously applying `domain-modeling` to capture terminology and decisions in docs as they crystallise.

## How to run it

Compose the two installed skills:

1. **Grill** (see `grilling` skill): interview relentlessly about every aspect of the plan, one question at a time, walking down each branch of the design tree and resolving dependencies between decisions one-by-one. For each question, give your recommended answer. If a question can be answered by exploring the codebase, explore instead of asking.

2. **Maintain docs inline** (see `domain-modeling` skill): as terms and decisions crystallise during the grilling, capture them immediately — don't batch:
   - Resolve fuzzy/overloaded terminology → update the glossary (`CONTEXT.md`, or this workspace's spec `requirements.md` glossary) using `domain-modeling/CONTEXT-FORMAT.md`.
   - Challenge new terms against the existing glossary and against the code; surface contradictions.
   - When a decision is **hard to reverse + surprising + a real trade-off**, offer an ADR using `domain-modeling/ADR-FORMAT.md` (in this workspace, prefer `.kiro/steering/architecture-decisions.md`).

## Stop condition

The session ends when you and the user reach a shared, unambiguous understanding of the plan — and the glossary/ADRs reflect every term and decision that crystallised along the way.

Do NOT start implementing the feature when the grilling finishes. Producing the sharpened plan + updated docs is the deliverable; implementation is a separate, later step that needs its own go-ahead.
