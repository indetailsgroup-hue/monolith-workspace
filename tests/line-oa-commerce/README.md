# LINE OA Commerce — Property-Based Testing (PBT) Harness

Scaffolding for the property-based tests of **LINE OA Commerce (Module B5)**
(spec task 1.1). Two harnesses split the work along the design's trust boundary:

| Harness | Tool | Scope |
|---------|------|-------|
| `ts/`   | [`fast-check`](https://fast-check.dev) + Vitest | Edge-Function / pure-adapter logic (signature framing, idempotency keying, template classification, brand-voice limits, confidence/guardrail logic) |
| `py/`   | [`hypothesis`](https://hypothesis.readthedocs.io) + pytest | Database-layer properties over a real DB driver (`line_oa_*` schema, RLS, SECURITY DEFINER RPCs, audit immutability) |

Both share two **mocks** so tests never touch external systems:

- A **deterministic mock of the LINE Messaging API** (`mocks/lineMessagingApi.ts`, `mocks/line_messaging_api.py`).
- A **spy/stub for `record_input_sync`** — the forecasting pipeline, which this module reuses and must not redefine (`mocks/recordInputSync.ts`, `mocks/record_input_sync.py`).

## Property-tag convention

Every property test is tagged with the canonical comment/string:

```
Feature: line-oa-commerce, Property {n}: {text}
```

where `{n}` is the Correctness Property number from `design.md` (Properties 1–31)
and `{text}` is its short title. Build the string with the harness helpers rather
than hand-writing it:

- **TypeScript:** `propertyTag(n, text)` and the `describeProperty(n, text, fn)`
  Vitest binding (`ts/property.ts`).
- **Python:** `property_tag(n, text)` and the `@property(n, text)` decorator
  (`py/harness.py`).

## Default iterations

Property tests run a **minimum of 100 iterations**.

- **TypeScript:** `PROPERTY_RUNS = 100`; pass `fcParams()` to `fc.assert(...)`.
- **Python:** the `line_oa` Hypothesis profile sets `max_examples = 100` and is
  loaded automatically by `py/conftest.py`.

## Running

TypeScript (uses the repo's Vitest — `fast-check` is already a devDependency):

```bash
npm run test:run -- tests/line-oa-commerce/ts
```

Python (from the `py/` directory):

```bash
pip install -r tests/line-oa-commerce/py/requirements.txt
cd tests/line-oa-commerce/py && pytest
```

Database-layer property tests require a Postgres connection string in
`LINE_OA_TEST_DATABASE_URL`; they should `skip` when it is unset.

> **Scaffold status:** only the harness, mocks, conventions, and smoke tests
> exist today. The 31 Correctness Property tests are added by their respective
> later tasks.
