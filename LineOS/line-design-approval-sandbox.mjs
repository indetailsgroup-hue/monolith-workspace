import {
  assertConfirmReviewInput,
  assertReviewSnapshot
} from "./line-design-approval-contract.mjs";
import {
  createSandboxVerificationRecord
} from "./line-design-approval-record.mjs";
import { canonicalize, deepFreeze } from "./line-flex-model.mjs";

const DEFAULT_REVIEW_TOKEN = "rvw_A1_7L3n9Q2pV8xK";
const MAX_REVIEW_TTL_MS = 60 * 60 * 1000;
const MAP_GET = Map.prototype.get;
const MAP_SET = Map.prototype.set;
const MAP_SIZE = Object.getOwnPropertyDescriptor(Map.prototype, "size").get;
const STRUCTURED_CLONE = globalThis.structuredClone;
const BOUND_SCALAR_FIELDS = deepFreeze([
  "providerContext",
  "scopeContext",
  "workItemRef",
  "approvalRequestRef",
  "revisionLabel",
  "requestedCanonicalAction",
  "plainLanguageConsequence",
  "fixtureIdentity",
  "reviewTtlMs"
]);
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const OPAQUE_FIXTURE_ID = /^fx_[A-Za-z0-9_-]{13,125}$/;
const FORBIDDEN_FIXTURE_ID_SEMANTICS =
  /tenant|customer|role|recipient|project|approval|secret|signature|key/i;
const ALLOWED_PLAIN_LANGUAGE_CONSEQUENCES = deepFreeze([
  "Records a sandbox confirmation attempt only."
]);
const ALLOWED_REVIEW_ARTIFACT_LISTS = deepFreeze([
  [{
    kind: "rendered_preview",
    label: "Main kitchen perspective",
    uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png"
  }],
  [{
    kind: "rendered_preview",
    label: "Guest bedroom perspective",
    uri: "https://example.com/monolith/demo/artifacts/guest-bedroom.png"
  }]
]);
const ALLOWED_REVIEW_ARTIFACT_CANONICAL_VALUES = deepFreeze(
  ALLOWED_REVIEW_ARTIFACT_LISTS.map((artifacts) => canonicalize(artifacts))
);
const ISSUED_ID_PATTERNS = deepFreeze({
  reviewSessionId: /^review_session_demo_\d{3}$/,
  serverIssuedIdempotencyKey: /^idempotency_demo_\d{3}$/,
  recordId: /^record_demo_\d{3}$/,
  correlationId: /^correlation_demo_\d{3}$/
});
const RECORD_INPUT_KEYS = deepFreeze([
  "recordId",
  "correlationId",
  "reviewSessionId",
  "providerContext",
  "scopeContext",
  "workItemRef",
  "approvalRequestRef",
  "revisionLabel",
  "revisionId",
  "artifactManifestSha256",
  "canonicalizationVersion",
  "requestedCanonicalAction",
  "outcome",
  "createdAt",
  "confirmedAt"
]);
const RECORD_KEYS = deepFreeze([
  "title",
  "recordVersion",
  "mode",
  "businessEffect",
  "recordId",
  "correlationId",
  "reviewSessionId",
  "providerContext",
  "scopeContext",
  "workItemRef",
  "approvalRequestRef",
  "revisionLabel",
  "revisionId",
  "artifactManifestSha256",
  "requestedCanonicalAction",
  "outcome",
  "createdAt",
  "confirmedAt",
  "digestAlgorithm",
  "canonicalizationVersion",
  "recordDigest"
]);
const LEDGER_ENTRY_KEYS = deepFreeze([
  "canonicalPayload",
  "recordInput",
  "record"
]);
const CONFIRM_REVIEW_INPUT_KEYS = deepFreeze([
  "reviewSessionId",
  "serverIssuedIdempotencyKey",
  "expectedRevisionId",
  "decision"
]);

const OUTCOME = Object.fromEntries([
  "expired",
  "stale_revision",
  "version_conflict",
  "idempotency_conflict",
  "not_available",
  "invalid_request",
  "temporarily_unavailable"
].map((outcome) => [outcome, deepFreeze({ outcome })]));

const DEFAULT_FIXTURE = deepFreeze({
  providerContext: "Daph Studio · A1 sandbox fixture",
  scopeContext: "Main kitchen review scope",
  workItemRef: "work_item_demo_001",
  approvalRequestRef: "approval_request_demo_001",
  revisionLabel: "D-07",
  revisionId: "a".repeat(64),
  artifactManifestSha256: "b".repeat(64),
  canonicalizationVersion: "line-design-approval-v1",
  expectedWorkflowVersion: 7,
  reviewArtifacts: [{
    kind: "rendered_preview",
    label: "Main kitchen perspective",
    uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png"
  }],
  requestedCanonicalAction: "design.approve_revision",
  plainLanguageConsequence: "Records a sandbox confirmation attempt only.",
  reviewTtlMs: 15 * 60 * 1000,
  fixtureIdentity: "fx_A1_7L3n9Q2pV8xK"
});

const defaultFixtureSource = () => ({
  async open(reviewToken) {
    return reviewToken === DEFAULT_REVIEW_TOKEN ? DEFAULT_FIXTURE : null;
  },
  async recheck() {
    return DEFAULT_FIXTURE;
  }
});

const defaultIdFactory = () => {
  const counts = new Map();
  const prefixes = {
    reviewSessionId: "review_session_demo_",
    serverIssuedIdempotencyKey: "idempotency_demo_",
    recordId: "record_demo_",
    correlationId: "correlation_demo_"
  };
  return (kind) => {
    if (!Object.hasOwn(prefixes, kind)) throw new Error("unsupported_id_kind");
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${prefixes[kind]}${String(next).padStart(3, "0")}`;
  };
};

const timestampFor = (clock) => {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  const milliseconds = date.getTime();
  if (!Number.isFinite(milliseconds)) throw new Error("invalid_clock");
  const timestamp = date.toISOString();
  if (!CANONICAL_UTC_TIMESTAMP.test(timestamp)) throw new Error("invalid_clock");
  return { milliseconds, timestamp };
};

const cloneArtifacts = (artifacts) => artifacts.map((artifact) => ({
  kind: artifact.kind,
  label: artifact.label,
  uri: artifact.uri
}));

const boundFixtureFor = (fixture) => deepFreeze({
  providerContext: fixture.providerContext,
  scopeContext: fixture.scopeContext,
  workItemRef: fixture.workItemRef,
  approvalRequestRef: fixture.approvalRequestRef,
  revisionLabel: fixture.revisionLabel,
  revisionId: fixture.revisionId,
  artifactManifestSha256: fixture.artifactManifestSha256,
  canonicalizationVersion: fixture.canonicalizationVersion,
  expectedWorkflowVersion: fixture.expectedWorkflowVersion,
  reviewArtifacts: cloneArtifacts(fixture.reviewArtifacts),
  requestedCanonicalAction: fixture.requestedCanonicalAction,
  plainLanguageConsequence: fixture.plainLanguageConsequence,
  reviewTtlMs: fixture.reviewTtlMs,
  fixtureIdentity: fixture.fixtureIdentity
});

const snapshotFor = (bound, ids, issuedAt, expiresAt) => assertReviewSnapshot(deepFreeze({
  reviewSessionId: ids.reviewSessionId,
  serverIssuedIdempotencyKey: ids.serverIssuedIdempotencyKey,
  mode: "sandbox",
  businessEffect: "none",
  providerContext: bound.providerContext,
  workItemRef: bound.workItemRef,
  approvalRequestRef: bound.approvalRequestRef,
  revisionLabel: bound.revisionLabel,
  revisionId: bound.revisionId,
  artifactManifestSha256: bound.artifactManifestSha256,
  digestAlgorithm: "SHA-256",
  canonicalizationVersion: bound.canonicalizationVersion,
  expectedWorkflowVersion: bound.expectedWorkflowVersion,
  reviewArtifacts: cloneArtifacts(bound.reviewArtifacts),
  requestedCanonicalAction: bound.requestedCanonicalAction,
  plainLanguageConsequence: bound.plainLanguageConsequence,
  issuedAt,
  expiresAt
}));

const hasValidTtl = (value) => Number.isSafeInteger(value) &&
  value > 0 && value <= MAX_REVIEW_TTL_MS;

const hasOpaqueFixtureIdentity = (value) => typeof value === "string" &&
  OPAQUE_FIXTURE_ID.test(value) && !FORBIDDEN_FIXTURE_ID_SEMANTICS.test(value);

const hasAllowedFixtureDisclosure = (bound) => {
  try {
    return ALLOWED_PLAIN_LANGUAGE_CONSEQUENCES.includes(
      bound.plainLanguageConsequence
    ) && ALLOWED_REVIEW_ARTIFACT_CANONICAL_VALUES.includes(
      canonicalize(bound.reviewArtifacts)
    );
  } catch {
    return false;
  }
};

const hasTrustedFixtureSemantics = async (bound, snapshot) => {
  try {
    await createSandboxVerificationRecord(deepFreeze({
      recordId: "record_demo_000",
      correlationId: "correlation_demo_000",
      reviewSessionId: snapshot.reviewSessionId,
      providerContext: bound.providerContext,
      scopeContext: bound.scopeContext,
      workItemRef: bound.workItemRef,
      approvalRequestRef: bound.approvalRequestRef,
      revisionLabel: bound.revisionLabel,
      revisionId: bound.revisionId,
      artifactManifestSha256: bound.artifactManifestSha256,
      canonicalizationVersion: bound.canonicalizationVersion,
      requestedCanonicalAction: bound.requestedCanonicalAction,
      outcome: "sandbox_recorded",
      createdAt: snapshot.issuedAt,
      confirmedAt: snapshot.issuedAt
    }));
    return true;
  } catch {
    return false;
  }
};

const replayResult = (record) => deepFreeze({
  outcome: "sandbox_replayed",
  record
});

const recordedResult = (record) => deepFreeze({
  outcome: "sandbox_recorded",
  record
});

const exactFrozenDataValues = (value, expectedKeys, scalarOnly = false) => {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    const expected = new Set(expectedKeys);
    if (keys.length !== expectedKeys.length ||
        !keys.every((key) => typeof key === "string" && expected.has(key))) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries = [];
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || descriptor.enumerable !== true ||
          descriptor.configurable !== false || descriptor.writable !== false ||
          !Object.hasOwn(descriptor, "value") || Object.hasOwn(descriptor, "get") ||
          Object.hasOwn(descriptor, "set")) {
        return null;
      }
      if (scalarOnly && descriptor.value !== null &&
          !["string", "number", "boolean"].includes(typeof descriptor.value)) {
        return null;
      }
      entries.push([key, descriptor.value]);
    }
    return Object.fromEntries(entries);
  } catch {
    return null;
  }
};

const matchesTrustedRecord = async (recordInput, candidate) => {
  const oracle = await createSandboxVerificationRecord(recordInput);
  const candidateValues = exactFrozenDataValues(candidate, RECORD_KEYS, true);
  const oracleValues = exactFrozenDataValues(oracle, RECORD_KEYS, true);
  return candidateValues !== null && oracleValues !== null &&
    canonicalize(candidateValues) === canonicalize(oracleValues);
};

const validateLedgerEntry = async (entry, commitment) => {
  const entryValues = exactFrozenDataValues(entry, LEDGER_ENTRY_KEYS);
  const commitmentValues = exactFrozenDataValues(commitment, LEDGER_ENTRY_KEYS);
  if (!entryValues || !commitmentValues ||
      typeof entryValues.canonicalPayload !== "string" ||
      typeof commitmentValues.canonicalPayload !== "string") {
    return null;
  }
  const recordInputValues = exactFrozenDataValues(
    entryValues.recordInput,
    RECORD_INPUT_KEYS,
    true
  );
  const committedInputValues = exactFrozenDataValues(
    commitmentValues.recordInput,
    RECORD_INPUT_KEYS,
    true
  );
  if (!recordInputValues || !committedInputValues ||
      canonicalize(recordInputValues) !== canonicalize(committedInputValues) ||
      canonicalize(recordInputValues) !== canonicalize(entryValues.recordInput) ||
      entryValues.canonicalPayload !== commitmentValues.canonicalPayload ||
      !(await matchesTrustedRecord(entryValues.recordInput, entryValues.record))) {
    return null;
  }
  const recordValues = exactFrozenDataValues(entryValues.record, RECORD_KEYS, true);
  const committedRecordValues = exactFrozenDataValues(
    commitmentValues.record,
    RECORD_KEYS,
    true
  );
  if (!recordValues || !committedRecordValues ||
      canonicalize(recordValues) !== canonicalize(committedRecordValues)) {
    return null;
  }
  return deepFreeze({
    canonicalPayload: entryValues.canonicalPayload,
    record: commitmentValues.record
  });
};

const captureConfirmReviewInput = (callerInput) => {
  try {
    if (callerInput === null || typeof callerInput !== "object" ||
        Array.isArray(callerInput) ||
        Object.getPrototypeOf(callerInput) !== Object.prototype) {
      return null;
    }
    const keys = Reflect.ownKeys(callerInput);
    const expected = new Set(CONFIRM_REVIEW_INPUT_KEYS);
    if (keys.length !== CONFIRM_REVIEW_INPUT_KEYS.length ||
        !keys.every((key) => typeof key === "string" && expected.has(key))) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(callerInput);
    const entries = [];
    for (const key of CONFIRM_REVIEW_INPUT_KEYS) {
      const descriptor = descriptors[key];
      if (!descriptor || descriptor.enumerable !== true ||
          !Object.hasOwn(descriptor, "value") || Object.hasOwn(descriptor, "get") ||
          Object.hasOwn(descriptor, "set") || typeof descriptor.value !== "string") {
        return null;
      }
      entries.push([key, descriptor.value]);
    }
    if (typeof STRUCTURED_CLONE !== "function") return null;
    STRUCTURED_CLONE(callerInput);
    return deepFreeze(Object.fromEntries(entries));
  } catch {
    return null;
  }
};

const isSafeFreshLedger = (value) => {
  try {
    return value !== null && typeof value === "object" &&
      Object.getPrototypeOf(value) === Map.prototype &&
      Reflect.ownKeys(value).length === 0 &&
      MAP_SIZE.call(value) === 0;
  } catch {
    return false;
  }
};

const currentFixtureOutcome = (bound, current) => {
  if (!current || typeof current !== "object") return OUTCOME.not_available;
  if (current.revisionId !== bound.revisionId ||
      current.artifactManifestSha256 !== bound.artifactManifestSha256) {
    return OUTCOME.stale_revision;
  }
  if (current.expectedWorkflowVersion !== bound.expectedWorkflowVersion ||
      current.canonicalizationVersion !== bound.canonicalizationVersion) {
    return OUTCOME.version_conflict;
  }
  for (const field of BOUND_SCALAR_FIELDS) {
    if (current[field] !== bound[field]) return OUTCOME.not_available;
  }
  if (canonicalize(cloneArtifacts(current.reviewArtifacts)) !==
      canonicalize(bound.reviewArtifacts)) {
    return OUTCOME.stale_revision;
  }
  return null;
};

const validatedCurrentFixtureOutcome = async (session, current) => {
  try {
    const currentBound = boundFixtureFor(current);
    if (!hasValidTtl(currentBound.reviewTtlMs) ||
        !hasOpaqueFixtureIdentity(currentBound.fixtureIdentity) ||
        !hasAllowedFixtureDisclosure(currentBound)) {
      return OUTCOME.not_available;
    }
    const currentSnapshot = snapshotFor(
      currentBound,
      {
        reviewSessionId: session.snapshot.reviewSessionId,
        serverIssuedIdempotencyKey: session.snapshot.serverIssuedIdempotencyKey
      },
      session.snapshot.issuedAt,
      session.snapshot.expiresAt
    );
    if (!(await hasTrustedFixtureSemantics(currentBound, currentSnapshot))) {
      return OUTCOME.not_available;
    }
    return currentFixtureOutcome(session.bound, currentBound);
  } catch {
    return OUTCOME.not_available;
  }
};

export function createSandboxDesignApprovalPort(dependencies = {}) {
  const clock = dependencies.clock ?? (() => new Date());
  const idFactory = dependencies.idFactory ?? defaultIdFactory();
  const fixtureSource = dependencies.fixtureSource ?? defaultFixtureSource();
  const recordFactory = dependencies.recordFactory ?? createSandboxVerificationRecord;
  const ledger = dependencies.ledger ?? new Map();

  let validDependencies = false;
  try {
    validDependencies = typeof clock === "function" && typeof idFactory === "function" &&
      typeof fixtureSource?.open === "function" &&
      typeof fixtureSource?.recheck === "function" &&
      typeof recordFactory === "function" && isSafeFreshLedger(ledger);
  } catch {
    validDependencies = false;
  }
  if (!validDependencies) {
    throw new Error("invalid_sandbox_design_approval_dependencies");
  }

  const sessions = new Map();
  const pendingByKey = new Map();
  const issuedIds = Object.fromEntries(
    Object.keys(ISSUED_ID_PATTERNS).map((kind) => [kind, new Set()])
  );

  const issueId = (kind) => {
    const pattern = ISSUED_ID_PATTERNS[kind];
    const seen = issuedIds[kind];
    if (!pattern || !seen) throw new Error("invalid_issued_id");
    const value = idFactory(kind);
    if (typeof value !== "string" || !pattern.test(value) || seen.has(value)) {
      throw new Error("invalid_issued_id");
    }
    seen.add(value);
    return value;
  };

  const openReview = async (reviewToken) => {
    let fixture;
    try {
      fixture = await fixtureSource.open(reviewToken);
    } catch {
      return OUTCOME.not_available;
    }
    if (!fixture) return OUTCOME.not_available;

    try {
      const bound = boundFixtureFor(fixture);
      if (!hasValidTtl(bound.reviewTtlMs) ||
          !hasOpaqueFixtureIdentity(bound.fixtureIdentity) ||
          !hasAllowedFixtureDisclosure(bound)) {
        return OUTCOME.not_available;
      }
      const issued = timestampFor(clock);
      const expiresAt = new Date(issued.milliseconds + bound.reviewTtlMs).toISOString();
      const ids = {
        reviewSessionId: issueId("reviewSessionId"),
        serverIssuedIdempotencyKey: issueId("serverIssuedIdempotencyKey")
      };
      const snapshot = snapshotFor(bound, ids, issued.timestamp, expiresAt);
      if (!(await hasTrustedFixtureSemantics(bound, snapshot))) {
        return OUTCOME.not_available;
      }
      if (sessions.has(snapshot.reviewSessionId)) return OUTCOME.temporarily_unavailable;
      sessions.set(snapshot.reviewSessionId, {
        bound,
        commitment: null,
        expired: false,
        snapshot
      });
      return snapshot;
    } catch {
      return OUTCOME.temporarily_unavailable;
    }
  };

  const recordAttempt = async (
    session,
    confirmedInput,
    canonicalPayload,
    confirmedAt
  ) => {
    try {
      const current = await fixtureSource.recheck(session.bound);
      const recheckFailure = await validatedCurrentFixtureOutcome(session, current);
      if (recheckFailure) return recheckFailure;
      const recordInput = deepFreeze({
        recordId: issueId("recordId"),
        correlationId: issueId("correlationId"),
        reviewSessionId: session.snapshot.reviewSessionId,
        providerContext: session.bound.providerContext,
        scopeContext: session.bound.scopeContext,
        workItemRef: session.bound.workItemRef,
        approvalRequestRef: session.bound.approvalRequestRef,
        revisionLabel: session.bound.revisionLabel,
        revisionId: session.bound.revisionId,
        artifactManifestSha256: session.bound.artifactManifestSha256,
        canonicalizationVersion: session.bound.canonicalizationVersion,
        requestedCanonicalAction: session.bound.requestedCanonicalAction,
        outcome: "sandbox_recorded",
        createdAt: session.snapshot.issuedAt,
        confirmedAt
      });
      const record = await recordFactory(recordInput);
      if (!(await matchesTrustedRecord(recordInput, record))) {
        return OUTCOME.temporarily_unavailable;
      }
      const finalCurrent = await fixtureSource.recheck(session.bound);
      const finalRecheckFailure = await validatedCurrentFixtureOutcome(session, finalCurrent);
      if (finalRecheckFailure) return finalRecheckFailure;
      const finalNow = timestampFor(clock);
      if (finalNow.milliseconds >= Date.parse(session.snapshot.expiresAt)) {
        session.expired = true;
        return OUTCOME.expired;
      }
      const entry = deepFreeze({
        canonicalPayload,
        recordInput,
        record
      });
      MAP_SET.call(
        ledger,
        confirmedInput.serverIssuedIdempotencyKey,
        entry
      );
      session.commitment = entry;
      return recordedResult(record);
    } catch {
      return OUTCOME.temporarily_unavailable;
    }
  };

  const confirmReview = async (callerInput) => {
    const confirmedInput = captureConfirmReviewInput(callerInput);
    if (!confirmedInput) return OUTCOME.invalid_request;
    try {
      assertConfirmReviewInput(confirmedInput);
    } catch {
      return OUTCOME.invalid_request;
    }

    const session = sessions.get(confirmedInput.reviewSessionId);
    if (!session ||
        confirmedInput.serverIssuedIdempotencyKey !==
          session.snapshot.serverIssuedIdempotencyKey) {
      return OUTCOME.not_available;
    }

    let now;
    try {
      now = timestampFor(clock);
    } catch {
      return OUTCOME.temporarily_unavailable;
    }
    if (session.expired || now.milliseconds >= Date.parse(session.snapshot.expiresAt)) {
      session.expired = true;
      return OUTCOME.expired;
    }

    const canonicalPayload = canonicalize(confirmedInput);
    let existing;
    try {
      existing = MAP_GET.call(
        ledger,
        confirmedInput.serverIssuedIdempotencyKey
      );
    } catch {
      return OUTCOME.temporarily_unavailable;
    }
    if (existing) {
      let validated;
      try {
        validated = await validateLedgerEntry(existing, session.commitment);
      } catch {
        return OUTCOME.temporarily_unavailable;
      }
      if (!validated) return OUTCOME.temporarily_unavailable;
      return validated.canonicalPayload === canonicalPayload
        ? replayResult(validated.record)
        : OUTCOME.idempotency_conflict;
    }
    if (session.commitment) return OUTCOME.temporarily_unavailable;

    const pending = pendingByKey.get(
      confirmedInput.serverIssuedIdempotencyKey
    );
    if (pending) {
      if (pending.canonicalPayload !== canonicalPayload) {
        return OUTCOME.idempotency_conflict;
      }
      const completed = await pending.promise;
      return completed.outcome === "sandbox_recorded"
        ? replayResult(completed.record)
        : completed;
    }

    if (confirmedInput.expectedRevisionId !== session.snapshot.revisionId) {
      return OUTCOME.stale_revision;
    }

    const promise = recordAttempt(
      session,
      confirmedInput,
      canonicalPayload,
      now.timestamp
    );
    pendingByKey.set(confirmedInput.serverIssuedIdempotencyKey, {
      canonicalPayload,
      promise
    });
    try {
      return await promise;
    } finally {
      if (pendingByKey.get(confirmedInput.serverIssuedIdempotencyKey)?.promise === promise) {
        pendingByKey.delete(confirmedInput.serverIssuedIdempotencyKey);
      }
    }
  };

  return deepFreeze({ openReview, confirmReview });
}
