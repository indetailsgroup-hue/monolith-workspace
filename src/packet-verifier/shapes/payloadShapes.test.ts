// S17-5 payload validators + canonical path — unit tests (review 2026-07-18
// F-01/F-02): the closed registry and every transcribed payload schema must
// reject unknown fields, missing fields, broken canonical ordering
// (x-monolith-orderBy), micrometre violations and Windows path hazards.
import { describe, it, expect } from 'vitest';
import {
  PAYLOAD_REGISTRY,
  validateConnectorOps, validateConnectorsMinifix, validateCutlist,
  validateDrillmap, validateGateResult,
} from './payloadShapes';
import { validateCanonicalPath } from './canonicalPath';
import type { JsonValue } from '../canonical/strictJson';

type Obj = { [k: string]: JsonValue };

// ---------------------------------------------------------------- fixtures
const validPart: Obj = {
  partId: 'part-001', cabinetId: 'cab-001', materialId: 'mdf-18', quantity: 1,
  finishWidthUm: 600000, finishHeightUm: 720000, cutWidthUm: 600000, cutHeightUm: 719500,
  thicknessUm: 18000, grain: 'VERTICAL',
  edgeBandUm: { leftUm: 0, rightUm: 0, topUm: 1000, bottomUm: 0 },
  premillUm: { leftUm: 0, rightUm: 0, topUm: 500, bottomUm: 0 },
};
const cutlistOf = (parts: JsonValue[]): Obj => ({ schema: 'monolith.factory.cutlist@2.0', parts });

const validPoint: Obj = {
  pointId: 'point-001',
  positionUm: { xUm: 37000, yUm: 100000, zUm: 9000 },
  directionMicro: { xMicro: 0, yMicro: 0, zMicro: 1000000 },
  diameterUm: 15000, depthUm: 12500, throughHole: false,
  purpose: 'CAM_LOCK', componentType: 'HOUSING', face: 'A', status: 'VALID',
};
const drillmapOf = (panels: JsonValue[]): Obj => ({ schema: 'monolith.factory.drillmap@2.0', panels });
const validPanel: Obj = {
  panelId: 'panel-001', cabinetId: 'cab-001', role: 'LEFT_SIDE',
  dimensionsUm: { widthUm: 600000, heightUm: 720000, thicknessUm: 18000 },
  points: [validPoint],
};

const validGate: Obj = {
  schema: 'monolith.factory.gate-result@2.0', policyVersion: '1.0.0', result: 'PASS', findings: [],
};

describe('PAYLOAD_REGISTRY — closed world (F-02)', () => {
  it('declares exactly the six packet-v2 payloads and no extension', () => {
    expect([...PAYLOAD_REGISTRY.keys()].sort()).toEqual([
      'NOT_FOR_PRODUCTION.txt', 'connector-ops.json', 'connectors.minifix.json',
      'cutlist.json', 'drillmap.json', 'gate-result.json',
    ]);
    // every JSON payload carries a validator; only the pinned NFP text does not
    for (const [path, contract] of PAYLOAD_REGISTRY) {
      if (contract.mediaType === 'application/json') expect(contract.validate, path).toBeDefined();
      else expect(contract.validate, path).toBeUndefined();
    }
  });
});

describe('validateGateResult — the F-01 false-accept payload', () => {
  it('minimal valid gate evidence passes and yields the typed value', () => {
    const r = validateGateResult(validGate);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ policyVersion: '1.0.0', result: 'PASS' });
  });
  it('the review probe bytes {"result":"PASS"} are REJECTED (F-01 regression)', () => {
    // this exact value reached VERIFIED in the pre-fix build — never again
    const r = validateGateResult({ result: 'PASS' });
    expect(r.ok).toBe(false);
    expect(r.value).toBeUndefined();
  });
  it('result FAIL is rejected (schema const: PASS only)', () => {
    expect(validateGateResult({ ...validGate, result: 'FAIL' }).ok).toBe(false);
  });
  it('unknown field / missing field / bad policyVersion are rejected', () => {
    expect(validateGateResult({ ...validGate, extra: 1 }).ok).toBe(false);
    const noFindings: Obj = { ...validGate };
    delete noFindings.findings;
    expect(validateGateResult(noFindings).ok).toBe(false);
    expect(validateGateResult({ ...validGate, policyVersion: 'v1' }).ok).toBe(false);
  });
  it('findings out of canonical order (INFO before WARNING) are rejected', () => {
    const info: Obj = { code: 'TOOL_MARGIN_INFO', severity: 'INFO', entityIds: [], parameters: [] };
    const warn: Obj = { code: 'EDGE_DISTANCE_WARN', severity: 'WARNING', entityIds: [], parameters: [] };
    expect(validateGateResult({ ...validGate, findings: [warn, info] }).ok).toBe(true);
    expect(validateGateResult({ ...validGate, findings: [info, warn] }).ok).toBe(false);
  });
  it('parameter oneOf: type discriminator must match the value type', () => {
    const finding = (params: JsonValue[]): Obj => ({
      code: 'X_CODE', severity: 'INFO', entityIds: [], parameters: params,
    });
    expect(validateGateResult({ ...validGate, findings: [finding([{ key: 'a', type: 'INTEGER', value: 1 }])] }).ok).toBe(true);
    expect(validateGateResult({ ...validGate, findings: [finding([{ key: 'a', type: 'INTEGER', value: 'one' }])] }).ok).toBe(false);
    expect(validateGateResult({ ...validGate, findings: [finding([{ key: 'a', type: 'FLOAT', value: 1 }])] }).ok).toBe(false);
  });
});

describe('validateCutlist', () => {
  it('valid part list passes', () => {
    expect(validateCutlist(cutlistOf([validPart]))).toEqual({ ok: true });
  });
  it('partId order swap breaks x-monolith-orderBy', () => {
    const p2 = { ...validPart, partId: 'part-002' };
    expect(validateCutlist(cutlistOf([validPart, p2])).ok).toBe(true);
    expect(validateCutlist(cutlistOf([p2, validPart])).ok).toBe(false);
  });
  it('micrometre constraints: quantity 0 and negative edge band are rejected', () => {
    expect(validateCutlist(cutlistOf([{ ...validPart, quantity: 0 }])).ok).toBe(false);
    expect(validateCutlist(cutlistOf([{ ...validPart, edgeBandUm: { leftUm: -1, rightUm: 0, topUm: 0, bottomUm: 0 } }])).ok).toBe(false);
    expect(validateCutlist(cutlistOf([{ ...validPart, thicknessUm: 0 }])).ok).toBe(false);
    expect(validateCutlist(cutlistOf([{ ...validPart, cutWidthUm: 1.5 }])).ok).toBe(false);
  });
  it('unknown / missing fields are rejected (closed object)', () => {
    expect(validateCutlist(cutlistOf([{ ...validPart, note: 'x' }])).ok).toBe(false);
    const missing: Obj = { ...validPart };
    delete missing.materialId;
    expect(validateCutlist(cutlistOf([missing])).ok).toBe(false);
    expect(validateCutlist({ ...cutlistOf([]), schema: 'monolith.factory.cutlist@1.0' }).ok).toBe(false);
  });
});

describe('validateDrillmap', () => {
  it('valid panel passes; negative/zero micrometres rejected', () => {
    expect(validateDrillmap(drillmapOf([validPanel]))).toEqual({ ok: true });
    const badPoint = { ...validPoint, diameterUm: -8000 };
    expect(validateDrillmap(drillmapOf([{ ...validPanel, points: [badPoint] }])).ok).toBe(false);
    const badDims = { ...validPanel, dimensionsUm: { widthUm: 0, heightUm: 720000, thicknessUm: 18000 } };
    expect(validateDrillmap(drillmapOf([badDims])).ok).toBe(false);
  });
  it('point order + enum membership enforced', () => {
    const p2 = { ...validPoint, pointId: 'point-000' };
    expect(validateDrillmap(drillmapOf([{ ...validPanel, points: [validPoint, p2] }])).ok).toBe(false);
    expect(validateDrillmap(drillmapOf([{ ...validPanel, points: [{ ...validPoint, purpose: 'GLUE' }] }])).ok).toBe(false);
  });
});

describe('validateConnectorOps / validateConnectorsMinifix', () => {
  const validOp: Obj = {
    operationId: 'op-001', panelId: 'panel-001', pairId: 'pair-001', featureId: 'feat-001',
    type: 'DRILL', face: 'A',
    positionUm: { xUm: 37000, yUm: 100000, zUm: 9000 },
    directionMicro: { xMicro: 0, yMicro: 0, zMicro: 1000000 },
    diameterUm: 15000, depthUm: 12500, tags: ['cam', 'minifix'],
  };
  it('valid op passes; unordered tags and unknown type rejected', () => {
    expect(validateConnectorOps({ schema: 'monolith.factory.connector-ops@2.0', operations: [validOp] })).toEqual({ ok: true });
    expect(validateConnectorOps({ schema: 'monolith.factory.connector-ops@2.0', operations: [{ ...validOp, tags: ['minifix', 'cam'] }] }).ok).toBe(false);
    expect(validateConnectorOps({ schema: 'monolith.factory.connector-ops@2.0', operations: [{ ...validOp, type: 'ROUTE' }] }).ok).toBe(false);
  });
  it('minifix pair member missing bolt is rejected', () => {
    const member: Obj = {
      pointId: 'point-cam', panelId: 'panel-001',
      positionUm: { xUm: 1, yUm: 2, zUm: 3 },
      directionMicro: { xMicro: 0, yMicro: 0, zMicro: 1000000 },
      diameterUm: 15000, depthUm: 12500,
    };
    const pair: Obj = { pairId: 'pair-001', connectorId: 'minifix-15', cam: member, bolt: { ...member, pointId: 'point-bolt' } };
    expect(validateConnectorsMinifix({ schema: 'monolith.factory.connectors-minifix@2.0', pairs: [pair] })).toEqual({ ok: true });
    const noBolt: Obj = { ...pair };
    delete noBolt.bolt;
    expect(validateConnectorsMinifix({ schema: 'monolith.factory.connectors-minifix@2.0', pairs: [noBolt] }).ok).toBe(false);
  });
});

describe('validateCanonicalPath (F-02 — one validator for ZIP and manifest layers)', () => {
  it('accepts the six registry names', () => {
    for (const path of PAYLOAD_REGISTRY.keys()) {
      expect(validateCanonicalPath(path)).toEqual({ ok: true });
    }
  });
  it('rejects non-NFC, Windows reserved names, trailing dot/space', () => {
    expect(validateCanonicalPath('cafe\u0301.json').ok).toBe(false); // NFD e + combining acute
    expect(validateCanonicalPath('caf\u00e9.json').ok).toBe(true); // NFC form of the same name
    expect(validateCanonicalPath('CON.json').ok).toBe(false);
    expect(validateCanonicalPath('con.json').ok).toBe(false); // case-insensitive
    expect(validateCanonicalPath('COM5.json').ok).toBe(false);
    expect(validateCanonicalPath('lpt9').ok).toBe(false);
    expect(validateCanonicalPath('x.').ok).toBe(false);
    expect(validateCanonicalPath('x ').ok).toBe(false);
  });
  it('rejects traversal, separators, control and forbidden characters, length', () => {
    expect(validateCanonicalPath('').ok).toBe(false);
    expect(validateCanonicalPath('..').ok).toBe(false);
    expect(validateCanonicalPath('a/../b').ok).toBe(false);
    expect(validateCanonicalPath('/abs').ok).toBe(false);
    expect(validateCanonicalPath('a\\b').ok).toBe(false);
    expect(validateCanonicalPath('a:b').ok).toBe(false);
    expect(validateCanonicalPath('a?b').ok).toBe(false);
    expect(validateCanonicalPath('a*b').ok).toBe(false);
    expect(validateCanonicalPath('a\u0000b').ok).toBe(false);
    expect(validateCanonicalPath('a'.repeat(129)).ok).toBe(false);
    expect(validateCanonicalPath('a'.repeat(128)).ok).toBe(true);
  });
});
