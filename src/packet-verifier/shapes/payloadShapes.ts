// S17-5 — payload schema validators, transcribed verbatim from the approved
// schema bundle (cutlist/drillmap/connector-ops/connectors-minifix/gate-result
// @2.0 + common.schema.json $defs). Independent review 2026-07-18 F-01/F-02:
// the verifier previously canonical-parsed payloads without validating them,
// so schema-invalid gate evidence could reach VERIFIED. Every JSON payload is
// now validated against the exact contentSchema the closed registry declares
// for its path — unknown paths, unknown fields, wrong types, broken canonical
// array ordering (x-monolith-orderBy) and oneOf mismatches all fail closed.

import { jcsSerialize } from '../canonical/jcs';
import type { JsonValue } from '../canonical/strictJson';

type Obj = { [k: string]: JsonValue };

export interface PayloadVerdict {
  ok: boolean;
  detail?: string;
}

const OK: PayloadVerdict = { ok: true };
const bad = (detail: string): PayloadVerdict => ({ ok: false, detail });

// ---------------------------------------------------------------- primitives
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const GATE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const PARAM_KEY = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const MAX_SAFE = 9007199254740991;

function isObj(v: JsonValue | undefined): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isOpaqueId(v: JsonValue | undefined): boolean {
  return typeof v === 'string' && v.length >= 1 && v.length <= 128 && OPAQUE_ID.test(v);
}
function isInt(v: JsonValue | undefined, min: number, max: number): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}
const isPositiveUm = (v: JsonValue | undefined) => isInt(v, 1, MAX_SAFE);
const isNonNegativeUm = (v: JsonValue | undefined) => isInt(v, 0, MAX_SAFE);
const isSignedUm = (v: JsonValue | undefined) => isInt(v, -MAX_SAFE, MAX_SAFE);

/** closed-object check: exactly the required keys, plus listed optionals */
function closedKeys(o: Obj, required: readonly string[], optional: readonly string[] = []): string | null {
  for (const k of required) if (!(k in o)) return `missing field ${k}`;
  for (const k of Object.keys(o)) {
    if (!required.includes(k) && !optional.includes(k)) return `unknown field ${k}`;
  }
  return null;
}

function utf8Compare(a: string, b: string): number {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const n = Math.min(ea.length, eb.length);
  for (let i = 0; i < n; i++) if (ea[i] !== eb[i]) return ea[i] - eb[i];
  return ea.length - eb.length;
}

function checkVectorUm(v: JsonValue | undefined, where: string): PayloadVerdict {
  if (!isObj(v)) return bad(`${where}: not an object`);
  const k = closedKeys(v, ['xUm', 'yUm', 'zUm']);
  if (k) return bad(`${where}: ${k}`);
  for (const axis of ['xUm', 'yUm', 'zUm'] as const) {
    if (!isSignedUm(v[axis])) return bad(`${where}.${axis}: not a signed micrometre integer`);
  }
  return OK;
}

function checkDirectionMicro(v: JsonValue | undefined, where: string): PayloadVerdict {
  if (!isObj(v)) return bad(`${where}: not an object`);
  const k = closedKeys(v, ['xMicro', 'yMicro', 'zMicro']);
  if (k) return bad(`${where}: ${k}`);
  for (const axis of ['xMicro', 'yMicro', 'zMicro'] as const) {
    if (!isInt(v[axis], -1000000, 1000000)) return bad(`${where}.${axis}: outside [-1000000, 1000000]`);
  }
  return OK;
}

/** strict ascending UTF-8 order over an id extracted per item (x-monolith-orderBy) */
function checkIdOrder(items: readonly Obj[], idField: string, where: string): PayloadVerdict {
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1][idField];
    const cur = items[i][idField];
    if (typeof prev !== 'string' || typeof cur !== 'string') continue; // typed elsewhere
    if (utf8Compare(prev, cur) >= 0) {
      return bad(`${where}: not in canonical ${idField} UTF-8 order (x-monolith-orderBy)`);
    }
  }
  return OK;
}

// ---------------------------------------------------------------- cutlist@2.0
function checkEdges(v: JsonValue | undefined, where: string): PayloadVerdict {
  if (!isObj(v)) return bad(`${where}: not an object`);
  const k = closedKeys(v, ['leftUm', 'rightUm', 'topUm', 'bottomUm']);
  if (k) return bad(`${where}: ${k}`);
  for (const e of ['leftUm', 'rightUm', 'topUm', 'bottomUm'] as const) {
    if (!isNonNegativeUm(v[e])) return bad(`${where}.${e}: not a non-negative micrometre integer`);
  }
  return OK;
}

export function validateCutlist(v: JsonValue): PayloadVerdict {
  if (!isObj(v)) return bad('cutlist: not an object');
  const k = closedKeys(v, ['schema', 'parts']);
  if (k) return bad(`cutlist: ${k}`);
  if (v.schema !== 'monolith.factory.cutlist@2.0') return bad('cutlist.schema: wrong const');
  if (!Array.isArray(v.parts)) return bad('cutlist.parts: not an array');
  const parts: Obj[] = [];
  for (let i = 0; i < v.parts.length; i++) {
    const p = v.parts[i];
    const where = `cutlist.parts[${i}]`;
    if (!isObj(p)) return bad(`${where}: not an object`);
    const pk = closedKeys(p, ['partId', 'cabinetId', 'materialId', 'quantity', 'finishWidthUm', 'finishHeightUm', 'cutWidthUm', 'cutHeightUm', 'thicknessUm', 'grain', 'edgeBandUm', 'premillUm']);
    if (pk) return bad(`${where}: ${pk}`);
    for (const id of ['partId', 'cabinetId', 'materialId'] as const) {
      if (!isOpaqueId(p[id])) return bad(`${where}.${id}: invalid opaque id`);
    }
    if (!isInt(p.quantity, 1, 1000000)) return bad(`${where}.quantity: outside [1, 1000000]`);
    for (const um of ['finishWidthUm', 'finishHeightUm', 'cutWidthUm', 'cutHeightUm', 'thicknessUm'] as const) {
      if (!isPositiveUm(p[um])) return bad(`${where}.${um}: not a positive micrometre integer`);
    }
    if (p.grain !== 'HORIZONTAL' && p.grain !== 'VERTICAL' && p.grain !== 'NONE') return bad(`${where}.grain: not in enum`);
    for (const edges of ['edgeBandUm', 'premillUm'] as const) {
      const r = checkEdges(p[edges], `${where}.${edges}`);
      if (!r.ok) return r;
    }
    parts.push(p);
  }
  return checkIdOrder(parts, 'partId', 'cutlist.parts');
}

// ---------------------------------------------------------------- drillmap@2.0
const FACES = ['A', 'B', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
const PURPOSES = ['CAM_LOCK', 'BOLT', 'BOLT_ENTRY', 'BOLT_THREAD', 'DOWEL', 'SHELF_PIN', 'HINGE', 'MINIFIX', 'DRAWER_SLIDE', 'OTHER'];
const COMPONENT_TYPES = ['HOUSING', 'BOLT', 'DOWEL', 'PIN', 'HINGE', 'SLIDE_HOLE', 'OTHER'];

export function validateDrillmap(v: JsonValue): PayloadVerdict {
  if (!isObj(v)) return bad('drillmap: not an object');
  const k = closedKeys(v, ['schema', 'panels']);
  if (k) return bad(`drillmap: ${k}`);
  if (v.schema !== 'monolith.factory.drillmap@2.0') return bad('drillmap.schema: wrong const');
  if (!Array.isArray(v.panels)) return bad('drillmap.panels: not an array');
  const panels: Obj[] = [];
  for (let i = 0; i < v.panels.length; i++) {
    const panel = v.panels[i];
    const where = `drillmap.panels[${i}]`;
    if (!isObj(panel)) return bad(`${where}: not an object`);
    const pk = closedKeys(panel, ['panelId', 'cabinetId', 'role', 'dimensionsUm', 'points']);
    if (pk) return bad(`${where}: ${pk}`);
    if (!isOpaqueId(panel.panelId)) return bad(`${where}.panelId: invalid opaque id`);
    if (!isOpaqueId(panel.cabinetId)) return bad(`${where}.cabinetId: invalid opaque id`);
    if (typeof panel.role !== 'string' || panel.role.length < 1 || panel.role.length > 64) return bad(`${where}.role: invalid`);
    const dims = panel.dimensionsUm;
    if (!isObj(dims)) return bad(`${where}.dimensionsUm: not an object`);
    const dk = closedKeys(dims, ['widthUm', 'heightUm', 'thicknessUm']);
    if (dk) return bad(`${where}.dimensionsUm: ${dk}`);
    for (const d of ['widthUm', 'heightUm', 'thicknessUm'] as const) {
      if (!isPositiveUm(dims[d])) return bad(`${where}.dimensionsUm.${d}: not a positive micrometre integer`);
    }
    if (!Array.isArray(panel.points)) return bad(`${where}.points: not an array`);
    const points: Obj[] = [];
    for (let j = 0; j < panel.points.length; j++) {
      const pt = panel.points[j];
      const pwhere = `${where}.points[${j}]`;
      if (!isObj(pt)) return bad(`${pwhere}: not an object`);
      const ptk = closedKeys(pt,
        ['pointId', 'positionUm', 'directionMicro', 'diameterUm', 'depthUm', 'throughHole', 'purpose', 'componentType', 'face', 'status'],
        ['pairId', 'pairedPointId']);
      if (ptk) return bad(`${pwhere}: ${ptk}`);
      if (!isOpaqueId(pt.pointId)) return bad(`${pwhere}.pointId: invalid opaque id`);
      const pos = checkVectorUm(pt.positionUm, `${pwhere}.positionUm`);
      if (!pos.ok) return pos;
      const dir = checkDirectionMicro(pt.directionMicro, `${pwhere}.directionMicro`);
      if (!dir.ok) return dir;
      if (!isPositiveUm(pt.diameterUm)) return bad(`${pwhere}.diameterUm: not a positive micrometre integer`);
      if (!isPositiveUm(pt.depthUm)) return bad(`${pwhere}.depthUm: not a positive micrometre integer`);
      if (typeof pt.throughHole !== 'boolean') return bad(`${pwhere}.throughHole: not a boolean`);
      if (typeof pt.purpose !== 'string' || !PURPOSES.includes(pt.purpose)) return bad(`${pwhere}.purpose: not in enum`);
      if (typeof pt.componentType !== 'string' || !COMPONENT_TYPES.includes(pt.componentType)) return bad(`${pwhere}.componentType: not in enum`);
      if (typeof pt.face !== 'string' || !FACES.includes(pt.face)) return bad(`${pwhere}.face: not in enum`);
      if (pt.status !== 'VALID' && pt.status !== 'WARNING' && pt.status !== 'ERROR') return bad(`${pwhere}.status: not in enum`);
      if ('pairId' in pt && !isOpaqueId(pt.pairId)) return bad(`${pwhere}.pairId: invalid opaque id`);
      if ('pairedPointId' in pt && !isOpaqueId(pt.pairedPointId)) return bad(`${pwhere}.pairedPointId: invalid opaque id`);
      points.push(pt);
    }
    const po = checkIdOrder(points, 'pointId', `${where}.points`);
    if (!po.ok) return po;
    panels.push(panel);
  }
  return checkIdOrder(panels, 'panelId', 'drillmap.panels');
}

// ------------------------------------------------------------ connector-ops@2.0
export function validateConnectorOps(v: JsonValue): PayloadVerdict {
  if (!isObj(v)) return bad('connector-ops: not an object');
  const k = closedKeys(v, ['schema', 'operations']);
  if (k) return bad(`connector-ops: ${k}`);
  if (v.schema !== 'monolith.factory.connector-ops@2.0') return bad('connector-ops.schema: wrong const');
  if (!Array.isArray(v.operations)) return bad('connector-ops.operations: not an array');
  const ops: Obj[] = [];
  for (let i = 0; i < v.operations.length; i++) {
    const op = v.operations[i];
    const where = `connector-ops.operations[${i}]`;
    if (!isObj(op)) return bad(`${where}: not an object`);
    const ok = closedKeys(op, ['operationId', 'panelId', 'pairId', 'featureId', 'type', 'face', 'positionUm', 'directionMicro', 'diameterUm', 'depthUm', 'tags']);
    if (ok) return bad(`${where}: ${ok}`);
    for (const id of ['operationId', 'panelId', 'pairId', 'featureId'] as const) {
      if (!isOpaqueId(op[id])) return bad(`${where}.${id}: invalid opaque id`);
    }
    if (op.type !== 'DRILL') return bad(`${where}.type: wrong const`);
    if (typeof op.face !== 'string' || !FACES.includes(op.face)) return bad(`${where}.face: not in enum`);
    const pos = checkVectorUm(op.positionUm, `${where}.positionUm`);
    if (!pos.ok) return pos;
    const dir = checkDirectionMicro(op.directionMicro, `${where}.directionMicro`);
    if (!dir.ok) return dir;
    if (!isPositiveUm(op.diameterUm)) return bad(`${where}.diameterUm: not a positive micrometre integer`);
    if (!isPositiveUm(op.depthUm)) return bad(`${where}.depthUm: not a positive micrometre integer`);
    if (!Array.isArray(op.tags)) return bad(`${where}.tags: not an array`);
    for (let t = 0; t < op.tags.length; t++) {
      const tag = op.tags[t];
      if (typeof tag !== 'string' || tag.length < 1 || tag.length > 64) return bad(`${where}.tags[${t}]: invalid`);
      if (t > 0 && utf8Compare(op.tags[t - 1] as string, tag) >= 0) {
        return bad(`${where}.tags: not unique/canonically ordered (x-monolith-orderBy)`);
      }
    }
    ops.push(op);
  }
  return checkIdOrder(ops, 'operationId', 'connector-ops.operations');
}

// --------------------------------------------------------- connectors-minifix@2.0
function checkMember(v: JsonValue | undefined, where: string): PayloadVerdict {
  if (!isObj(v)) return bad(`${where}: not an object`);
  const k = closedKeys(v, ['pointId', 'panelId', 'positionUm', 'directionMicro', 'diameterUm', 'depthUm']);
  if (k) return bad(`${where}: ${k}`);
  if (!isOpaqueId(v.pointId)) return bad(`${where}.pointId: invalid opaque id`);
  if (!isOpaqueId(v.panelId)) return bad(`${where}.panelId: invalid opaque id`);
  const pos = checkVectorUm(v.positionUm, `${where}.positionUm`);
  if (!pos.ok) return pos;
  const dir = checkDirectionMicro(v.directionMicro, `${where}.directionMicro`);
  if (!dir.ok) return dir;
  if (!isPositiveUm(v.diameterUm)) return bad(`${where}.diameterUm: not a positive micrometre integer`);
  if (!isPositiveUm(v.depthUm)) return bad(`${where}.depthUm: not a positive micrometre integer`);
  return OK;
}

export function validateConnectorsMinifix(v: JsonValue): PayloadVerdict {
  if (!isObj(v)) return bad('connectors-minifix: not an object');
  const k = closedKeys(v, ['schema', 'pairs']);
  if (k) return bad(`connectors-minifix: ${k}`);
  if (v.schema !== 'monolith.factory.connectors-minifix@2.0') return bad('connectors-minifix.schema: wrong const');
  if (!Array.isArray(v.pairs)) return bad('connectors-minifix.pairs: not an array');
  const pairs: Obj[] = [];
  for (let i = 0; i < v.pairs.length; i++) {
    const pair = v.pairs[i];
    const where = `connectors-minifix.pairs[${i}]`;
    if (!isObj(pair)) return bad(`${where}: not an object`);
    const pk = closedKeys(pair, ['pairId', 'connectorId', 'cam', 'bolt']);
    if (pk) return bad(`${where}: ${pk}`);
    if (!isOpaqueId(pair.pairId)) return bad(`${where}.pairId: invalid opaque id`);
    if (!isOpaqueId(pair.connectorId)) return bad(`${where}.connectorId: invalid opaque id`);
    for (const m of ['cam', 'bolt'] as const) {
      const r = checkMember(pair[m], `${where}.${m}`);
      if (!r.ok) return r;
    }
    pairs.push(pair);
  }
  return checkIdOrder(pairs, 'pairId', 'connectors-minifix.pairs');
}

// ------------------------------------------------------------- gate-result@2.0
export interface GateEvidence {
  policyVersion: string;
  result: 'PASS';
}

const SEVERITY_RANK: Record<string, number> = { WARNING: 0, INFO: 1 };

export function validateGateResult(v: JsonValue): PayloadVerdict & { value?: GateEvidence } {
  if (!isObj(v)) return bad('gate-result: not an object');
  const k = closedKeys(v, ['schema', 'policyVersion', 'result', 'findings']);
  if (k) return bad(`gate-result: ${k}`);
  if (v.schema !== 'monolith.factory.gate-result@2.0') return bad('gate-result.schema: wrong const');
  if (typeof v.policyVersion !== 'string' || !SEMVER.test(v.policyVersion)) return bad('gate-result.policyVersion: not semver');
  // schema const: PASS is the ONLY valid value — the generator refuses to build
  // on a failing gate, so a packet carrying FAIL evidence is malformed.
  if (v.result !== 'PASS') return bad('gate-result.result: must be the const PASS');
  if (!Array.isArray(v.findings)) return bad('gate-result.findings: not an array');

  const keys: string[] = [];
  for (let i = 0; i < v.findings.length; i++) {
    const f = v.findings[i];
    const where = `gate-result.findings[${i}]`;
    if (!isObj(f)) return bad(`${where}: not an object`);
    const fk = closedKeys(f, ['code', 'severity', 'entityIds', 'parameters']);
    if (fk) return bad(`${where}: ${fk}`);
    if (typeof f.code !== 'string' || !GATE_CODE.test(f.code)) return bad(`${where}.code: invalid`);
    if (f.severity !== 'WARNING' && f.severity !== 'INFO') return bad(`${where}.severity: not in enum`);
    if (!Array.isArray(f.entityIds)) return bad(`${where}.entityIds: not an array`);
    for (let e = 0; e < f.entityIds.length; e++) {
      if (!isOpaqueId(f.entityIds[e])) return bad(`${where}.entityIds[${e}]: invalid opaque id`);
      if (e > 0 && utf8Compare(f.entityIds[e - 1] as string, f.entityIds[e] as string) >= 0) {
        return bad(`${where}.entityIds: not unique/canonically ordered`);
      }
    }
    if (!Array.isArray(f.parameters)) return bad(`${where}.parameters: not an array`);
    for (let p = 0; p < f.parameters.length; p++) {
      const param = f.parameters[p];
      const pwhere = `${where}.parameters[${p}]`;
      if (!isObj(param)) return bad(`${pwhere}: not an object`);
      const paramK = closedKeys(param, ['key', 'type', 'value']);
      if (paramK) return bad(`${pwhere}: ${paramK}`);
      if (typeof param.key !== 'string' || !PARAM_KEY.test(param.key)) return bad(`${pwhere}.key: invalid`);
      // oneOf: type discriminator must match the JS type of value exactly
      if (param.type === 'BOOLEAN') {
        if (typeof param.value !== 'boolean') return bad(`${pwhere}: type BOOLEAN but value is not boolean`);
      } else if (param.type === 'INTEGER') {
        if (typeof param.value !== 'number' || !Number.isInteger(param.value)) return bad(`${pwhere}: type INTEGER but value is not an integer`);
      } else if (param.type === 'STRING') {
        if (typeof param.value !== 'string') return bad(`${pwhere}: type STRING but value is not a string`);
      } else {
        return bad(`${pwhere}.type: not in enum`);
      }
      if (p > 0 && utf8Compare((f.parameters[p - 1] as Obj).key as string, param.key) >= 0) {
        return bad(`${where}.parameters: not canonically ordered by key`);
      }
    }
    // compound canonical order of findings themselves (severity rank, code,
    // entityIds JCS bytes, parameters JCS bytes) — strictly ascending
    keys.push([
      String(SEVERITY_RANK[f.severity]),
      f.code,
      jcsSerialize(f.entityIds),
      jcsSerialize(f.parameters),
    ].join(''));
    if (i > 0 && keys[i - 1] >= keys[i]) {
      return bad('gate-result.findings: not in canonical order (x-monolith-orderBy)');
    }
  }
  return { ok: true, value: { policyVersion: v.policyVersion, result: 'PASS' } };
}

// ---------------------------------------------------------------- registry
export interface PayloadContract {
  mediaType: 'application/json' | 'text/plain; charset=utf-8';
  contentSchema: string;
  /** undefined = non-JSON payload (validated elsewhere, e.g. the pinned NFP bytes) */
  validate?: (v: JsonValue) => PayloadVerdict;
}

/**
 * Closed path ↔ mediaType ↔ contentSchema registry for packet v2 (F-01/F-02).
 * This verifier build declares NO schema extensions: the manifest must list
 * exactly these six payloads and nothing else.
 */
export const PAYLOAD_REGISTRY: ReadonlyMap<string, PayloadContract> = new Map<string, PayloadContract>([
  ['NOT_FOR_PRODUCTION.txt', { mediaType: 'text/plain; charset=utf-8', contentSchema: 'monolith.factory.nfp-marker@1.0' }],
  ['connector-ops.json', { mediaType: 'application/json', contentSchema: 'monolith.factory.connector-ops@2.0', validate: validateConnectorOps }],
  ['connectors.minifix.json', { mediaType: 'application/json', contentSchema: 'monolith.factory.connectors-minifix@2.0', validate: validateConnectorsMinifix }],
  ['cutlist.json', { mediaType: 'application/json', contentSchema: 'monolith.factory.cutlist@2.0', validate: validateCutlist }],
  ['drillmap.json', { mediaType: 'application/json', contentSchema: 'monolith.factory.drillmap@2.0', validate: validateDrillmap }],
  ['gate-result.json', { mediaType: 'application/json', contentSchema: 'monolith.factory.gate-result@2.0', validate: validateGateResult }],
]);
