import {
  asJsonValue,
  assertArray,
  assertExactKeys,
  assertInteger,
  assertOpaqueId,
  assertSemver,
  assertSha256Id,
  assertString,
  compareUtf8,
  jcs,
  PacketGenerationError,
  sortUniqueUtf8,
} from './canonical.js';
import type {
  ConnectorMember,
  ConnectorOperation,
  ConnectorOpsPayload,
  ConnectorsMinifixPayload,
  CutListPart,
  CutListPayload,
  DirectionMicro,
  DrillMapPayload,
  DrillPanel,
  DrillPoint,
  EdgeValuesUm,
  ExporterIdentity,
  Face,
  GateFinding,
  GateParameter,
  GateResultPayload,
  MachineProfileDescriptor,
  MinifixPair,
  PacketPayloads,
  ReleasedRevision,
  VectorUm,
} from './types.js';

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const FACES: readonly Face[] = ['A', 'B', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
const FACE_RANK = new Map(FACES.map((value, index) => [value, index]));

function assertLiteral<T extends string>(value: unknown, expected: T, label: string): asserts value is T {
  if (value !== expected) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} must equal ${expected}`);
  }
}

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): asserts value is T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} is unsupported`);
  }
}

function normalizeVector(value: unknown, label: string): VectorUm {
  assertExactKeys(value, ['xUm', 'yUm', 'zUm'], [], label);
  assertInteger(value.xUm, `${label}.xUm`);
  assertInteger(value.yUm, `${label}.yUm`);
  assertInteger(value.zUm, `${label}.zUm`);
  return { xUm: value.xUm, yUm: value.yUm, zUm: value.zUm };
}

function normalizeDirection(value: unknown, label: string): DirectionMicro {
  assertExactKeys(value, ['xMicro', 'yMicro', 'zMicro'], [], label);
  assertInteger(value.xMicro, `${label}.xMicro`, -1_000_000, 1_000_000);
  assertInteger(value.yMicro, `${label}.yMicro`, -1_000_000, 1_000_000);
  assertInteger(value.zMicro, `${label}.zMicro`, -1_000_000, 1_000_000);
  return { xMicro: value.xMicro, yMicro: value.yMicro, zMicro: value.zMicro };
}

function normalizeFace(value: unknown, label: string): Face {
  assertEnum(value, FACES, label);
  return value;
}

function normalizeEdges(value: unknown, label: string): EdgeValuesUm {
  assertExactKeys(value, ['leftUm', 'rightUm', 'topUm', 'bottomUm'], [], label);
  assertInteger(value.leftUm, `${label}.leftUm`, 0, MAX_SAFE);
  assertInteger(value.rightUm, `${label}.rightUm`, 0, MAX_SAFE);
  assertInteger(value.topUm, `${label}.topUm`, 0, MAX_SAFE);
  assertInteger(value.bottomUm, `${label}.bottomUm`, 0, MAX_SAFE);
  return {
    leftUm: value.leftUm,
    rightUm: value.rightUm,
    topUm: value.topUm,
    bottomUm: value.bottomUm,
  };
}

export function normalizeReleasedRevision(value: unknown): ReleasedRevision {
  assertExactKeys(value, ['projectId', 'revisionId', 'state'], [], 'releasedRevision');
  assertOpaqueId(value.projectId, 'releasedRevision.projectId');
  assertOpaqueId(value.revisionId, 'releasedRevision.revisionId');
  assertLiteral(value.state, 'RELEASED', 'releasedRevision.state');
  return { projectId: value.projectId, revisionId: value.revisionId, state: 'RELEASED' };
}

export function normalizeExporter(value: unknown): ExporterIdentity {
  assertExactKeys(value, ['id', 'version', 'buildCommit', 'artifactSha256'], [], 'exporter');
  assertLiteral(value.id, 'monolith.factory-exporter', 'exporter.id');
  assertSemver(value.version, 'exporter.version');
  assertString(value.buildCommit, 'exporter.buildCommit', { pattern: /^[0-9a-f]{40}$/ });
  assertSha256Id(value.artifactSha256, 'exporter.artifactSha256');
  return {
    id: 'monolith.factory-exporter',
    version: value.version,
    buildCommit: value.buildCommit,
    artifactSha256: value.artifactSha256,
  };
}

export function normalizeMachineProfile(value: unknown): MachineProfileDescriptor {
  assertExactKeys(value, ['schema', 'id', 'version', 'units', 'parameters'], [], 'machineProfile');
  assertLiteral(value.schema, 'monolith.machine-profile@1.0', 'machineProfile.schema');
  assertLiteral(value.id, 'kdt_mvp_v1', 'machineProfile.id');
  assertLiteral(value.version, '1.0.0', 'machineProfile.version');
  assertLiteral(value.units, 'um', 'machineProfile.units');
  assertExactKeys(
    value.parameters,
    [
      'bedWidthUm',
      'bedLengthUm',
      'maxPanelThicknessUm',
      'minBoreDiameterUm',
      'maxBoreDiameterUm',
      'supportedFaces',
    ],
    [],
    'machineProfile.parameters',
  );
  const parameters = value.parameters;
  assertInteger(parameters.bedWidthUm, 'machineProfile.parameters.bedWidthUm', 1, MAX_SAFE);
  assertInteger(parameters.bedLengthUm, 'machineProfile.parameters.bedLengthUm', 1, MAX_SAFE);
  assertInteger(
    parameters.maxPanelThicknessUm,
    'machineProfile.parameters.maxPanelThicknessUm',
    1,
    MAX_SAFE,
  );
  assertInteger(parameters.minBoreDiameterUm, 'machineProfile.parameters.minBoreDiameterUm', 1, MAX_SAFE);
  assertInteger(parameters.maxBoreDiameterUm, 'machineProfile.parameters.maxBoreDiameterUm', 1, MAX_SAFE);
  assertArray(parameters.supportedFaces, 'machineProfile.parameters.supportedFaces');
  if (parameters.supportedFaces.length === 0) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'supportedFaces must not be empty');
  }
  const supportedFaces = parameters.supportedFaces.map((face, index) =>
    normalizeFace(face, `machineProfile.parameters.supportedFaces[${index}]`),
  );
  const uniqueFaces = new Set(supportedFaces);
  if (uniqueFaces.size !== supportedFaces.length) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'supportedFaces contains duplicates');
  }
  supportedFaces.sort((a, b) => (FACE_RANK.get(a) ?? 99) - (FACE_RANK.get(b) ?? 99));
  return {
    schema: 'monolith.machine-profile@1.0',
    id: 'kdt_mvp_v1',
    version: '1.0.0',
    units: 'um',
    parameters: {
      bedWidthUm: parameters.bedWidthUm,
      bedLengthUm: parameters.bedLengthUm,
      maxPanelThicknessUm: parameters.maxPanelThicknessUm,
      minBoreDiameterUm: parameters.minBoreDiameterUm,
      maxBoreDiameterUm: parameters.maxBoreDiameterUm,
      supportedFaces,
    },
  };
}

function normalizeCutList(value: unknown): CutListPayload {
  assertExactKeys(value, ['schema', 'parts'], [], 'cutlist');
  assertLiteral(value.schema, 'monolith.factory.cutlist@2.0', 'cutlist.schema');
  assertArray(value.parts, 'cutlist.parts');
  const parts: CutListPart[] = value.parts.map((part, index) => {
    const label = `cutlist.parts[${index}]`;
    assertExactKeys(
      part,
      [
        'partId',
        'cabinetId',
        'materialId',
        'quantity',
        'finishWidthUm',
        'finishHeightUm',
        'cutWidthUm',
        'cutHeightUm',
        'thicknessUm',
        'grain',
        'edgeBandUm',
        'premillUm',
      ],
      [],
      label,
    );
    assertOpaqueId(part.partId, `${label}.partId`);
    assertOpaqueId(part.cabinetId, `${label}.cabinetId`);
    assertOpaqueId(part.materialId, `${label}.materialId`);
    assertInteger(part.quantity, `${label}.quantity`, 1, 1_000_000);
    for (const key of ['finishWidthUm', 'finishHeightUm', 'cutWidthUm', 'cutHeightUm', 'thicknessUm'] as const) {
      assertInteger(part[key], `${label}.${key}`, 1, MAX_SAFE);
    }
    assertEnum(part.grain, ['HORIZONTAL', 'VERTICAL', 'NONE'] as const, `${label}.grain`);
    return {
      partId: part.partId,
      cabinetId: part.cabinetId,
      materialId: part.materialId,
      quantity: part.quantity,
      finishWidthUm: part.finishWidthUm as number,
      finishHeightUm: part.finishHeightUm as number,
      cutWidthUm: part.cutWidthUm as number,
      cutHeightUm: part.cutHeightUm as number,
      thicknessUm: part.thicknessUm as number,
      grain: part.grain,
      edgeBandUm: normalizeEdges(part.edgeBandUm, `${label}.edgeBandUm`),
      premillUm: normalizeEdges(part.premillUm, `${label}.premillUm`),
    };
  });
  parts.sort((a, b) => compareUtf8(a.partId, b.partId));
  assertUniqueKey(parts, (part) => part.partId, 'cutlist partId');
  return { schema: 'monolith.factory.cutlist@2.0', parts };
}

function normalizeDrillPoint(value: unknown, label: string): DrillPoint {
  assertExactKeys(
    value,
    [
      'pointId',
      'positionUm',
      'directionMicro',
      'diameterUm',
      'depthUm',
      'throughHole',
      'purpose',
      'componentType',
      'face',
      'status',
    ],
    ['pairId', 'pairedPointId'],
    label,
  );
  assertOpaqueId(value.pointId, `${label}.pointId`);
  assertInteger(value.diameterUm, `${label}.diameterUm`, 1, MAX_SAFE);
  assertInteger(value.depthUm, `${label}.depthUm`, 1, MAX_SAFE);
  if (typeof value.throughHole !== 'boolean') {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label}.throughHole must be boolean`);
  }
  assertEnum(
    value.purpose,
    ['CAM_LOCK', 'BOLT', 'BOLT_ENTRY', 'BOLT_THREAD', 'DOWEL', 'SHELF_PIN', 'HINGE', 'MINIFIX', 'DRAWER_SLIDE', 'OTHER'] as const,
    `${label}.purpose`,
  );
  assertEnum(
    value.componentType,
    ['HOUSING', 'BOLT', 'DOWEL', 'PIN', 'HINGE', 'SLIDE_HOLE', 'OTHER'] as const,
    `${label}.componentType`,
  );
  assertEnum(value.status, ['VALID', 'WARNING', 'ERROR'] as const, `${label}.status`);
  if (value.pairId !== undefined) assertOpaqueId(value.pairId, `${label}.pairId`);
  if (value.pairedPointId !== undefined) assertOpaqueId(value.pairedPointId, `${label}.pairedPointId`);
  const point: DrillPoint = {
    pointId: value.pointId,
    positionUm: normalizeVector(value.positionUm, `${label}.positionUm`),
    directionMicro: normalizeDirection(value.directionMicro, `${label}.directionMicro`),
    diameterUm: value.diameterUm,
    depthUm: value.depthUm,
    throughHole: value.throughHole,
    purpose: value.purpose,
    componentType: value.componentType,
    face: normalizeFace(value.face, `${label}.face`),
    status: value.status,
  };
  if (value.pairId !== undefined) point.pairId = value.pairId as string;
  if (value.pairedPointId !== undefined) point.pairedPointId = value.pairedPointId as string;
  return point;
}

function normalizeDrillMap(value: unknown): DrillMapPayload {
  assertExactKeys(value, ['schema', 'panels'], [], 'drillmap');
  assertLiteral(value.schema, 'monolith.factory.drillmap@2.0', 'drillmap.schema');
  assertArray(value.panels, 'drillmap.panels');
  const panels: DrillPanel[] = value.panels.map((panel, panelIndex) => {
    const label = `drillmap.panels[${panelIndex}]`;
    assertExactKeys(panel, ['panelId', 'cabinetId', 'role', 'dimensionsUm', 'points'], [], label);
    assertOpaqueId(panel.panelId, `${label}.panelId`);
    assertOpaqueId(panel.cabinetId, `${label}.cabinetId`);
    assertString(panel.role, `${label}.role`, { min: 1, max: 64 });
    assertExactKeys(panel.dimensionsUm, ['widthUm', 'heightUm', 'thicknessUm'], [], `${label}.dimensionsUm`);
    assertInteger(panel.dimensionsUm.widthUm, `${label}.dimensionsUm.widthUm`, 1, MAX_SAFE);
    assertInteger(panel.dimensionsUm.heightUm, `${label}.dimensionsUm.heightUm`, 1, MAX_SAFE);
    assertInteger(panel.dimensionsUm.thicknessUm, `${label}.dimensionsUm.thicknessUm`, 1, MAX_SAFE);
    assertArray(panel.points, `${label}.points`);
    const points = panel.points.map((point, pointIndex) =>
      normalizeDrillPoint(point, `${label}.points[${pointIndex}]`),
    );
    points.sort((a, b) => compareUtf8(a.pointId, b.pointId));
    assertUniqueKey(points, (point) => point.pointId, `${label} pointId`);
    return {
      panelId: panel.panelId,
      cabinetId: panel.cabinetId,
      role: panel.role,
      dimensionsUm: {
        widthUm: panel.dimensionsUm.widthUm,
        heightUm: panel.dimensionsUm.heightUm,
        thicknessUm: panel.dimensionsUm.thicknessUm,
      },
      points,
    };
  });
  panels.sort((a, b) => compareUtf8(a.panelId, b.panelId));
  assertUniqueKey(panels, (panel) => panel.panelId, 'drillmap panelId');
  return { schema: 'monolith.factory.drillmap@2.0', panels };
}

function normalizeMember(value: unknown, label: string): ConnectorMember {
  assertExactKeys(
    value,
    ['pointId', 'panelId', 'positionUm', 'directionMicro', 'diameterUm', 'depthUm'],
    [],
    label,
  );
  assertOpaqueId(value.pointId, `${label}.pointId`);
  assertOpaqueId(value.panelId, `${label}.panelId`);
  assertInteger(value.diameterUm, `${label}.diameterUm`, 1, MAX_SAFE);
  assertInteger(value.depthUm, `${label}.depthUm`, 1, MAX_SAFE);
  return {
    pointId: value.pointId,
    panelId: value.panelId,
    positionUm: normalizeVector(value.positionUm, `${label}.positionUm`),
    directionMicro: normalizeDirection(value.directionMicro, `${label}.directionMicro`),
    diameterUm: value.diameterUm,
    depthUm: value.depthUm,
  };
}

function normalizeConnectors(value: unknown): ConnectorsMinifixPayload {
  assertExactKeys(value, ['schema', 'pairs'], [], 'connectorsMinifix');
  assertLiteral(value.schema, 'monolith.factory.connectors-minifix@2.0', 'connectorsMinifix.schema');
  assertArray(value.pairs, 'connectorsMinifix.pairs');
  const pairs: MinifixPair[] = value.pairs.map((pair, index) => {
    const label = `connectorsMinifix.pairs[${index}]`;
    assertExactKeys(pair, ['pairId', 'connectorId', 'cam', 'bolt'], [], label);
    assertOpaqueId(pair.pairId, `${label}.pairId`);
    assertOpaqueId(pair.connectorId, `${label}.connectorId`);
    return {
      pairId: pair.pairId,
      connectorId: pair.connectorId,
      cam: normalizeMember(pair.cam, `${label}.cam`),
      bolt: normalizeMember(pair.bolt, `${label}.bolt`),
    };
  });
  pairs.sort((a, b) => compareUtf8(a.pairId, b.pairId));
  assertUniqueKey(pairs, (pair) => pair.pairId, 'connectors pairId');
  return { schema: 'monolith.factory.connectors-minifix@2.0', pairs };
}

function normalizeConnectorOps(value: unknown): ConnectorOpsPayload {
  assertExactKeys(value, ['schema', 'operations'], [], 'connectorOps');
  assertLiteral(value.schema, 'monolith.factory.connector-ops@2.0', 'connectorOps.schema');
  assertArray(value.operations, 'connectorOps.operations');
  const operations: ConnectorOperation[] = value.operations.map((operation, index) => {
    const label = `connectorOps.operations[${index}]`;
    assertExactKeys(
      operation,
      [
        'operationId',
        'panelId',
        'pairId',
        'featureId',
        'type',
        'face',
        'positionUm',
        'directionMicro',
        'diameterUm',
        'depthUm',
        'tags',
      ],
      [],
      label,
    );
    for (const key of ['operationId', 'panelId', 'pairId', 'featureId'] as const) {
      assertOpaqueId(operation[key], `${label}.${key}`);
    }
    assertLiteral(operation.type, 'DRILL', `${label}.type`);
    assertInteger(operation.diameterUm, `${label}.diameterUm`, 1, MAX_SAFE);
    assertInteger(operation.depthUm, `${label}.depthUm`, 1, MAX_SAFE);
    assertArray(operation.tags, `${label}.tags`);
    const tags = operation.tags.map((tag, tagIndex) => {
      assertString(tag, `${label}.tags[${tagIndex}]`, { min: 1, max: 64 });
      return tag;
    });
    return {
      operationId: operation.operationId as string,
      panelId: operation.panelId as string,
      pairId: operation.pairId as string,
      featureId: operation.featureId as string,
      type: 'DRILL',
      face: normalizeFace(operation.face, `${label}.face`),
      positionUm: normalizeVector(operation.positionUm, `${label}.positionUm`),
      directionMicro: normalizeDirection(operation.directionMicro, `${label}.directionMicro`),
      diameterUm: operation.diameterUm,
      depthUm: operation.depthUm,
      tags: sortUniqueUtf8(tags, `${label}.tags`),
    };
  });
  operations.sort((a, b) => compareUtf8(a.operationId, b.operationId));
  assertUniqueKey(operations, (operation) => operation.operationId, 'connector operationId');
  return { schema: 'monolith.factory.connector-ops@2.0', operations };
}

function normalizeGateParameter(value: unknown, label: string): GateParameter {
  assertExactKeys(value, ['key', 'type', 'value'], [], label);
  assertString(value.key, `${label}.key`, { pattern: /^[A-Za-z][A-Za-z0-9._-]{0,63}$/ });
  assertEnum(value.type, ['BOOLEAN', 'INTEGER', 'STRING'] as const, `${label}.type`);
  if (value.type === 'BOOLEAN') {
    if (typeof value.value !== 'boolean') {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label}.value must be boolean`);
    }
    return { key: value.key, type: 'BOOLEAN', value: value.value };
  }
  if (value.type === 'INTEGER') {
    assertInteger(value.value, `${label}.value`);
    return { key: value.key, type: 'INTEGER', value: value.value };
  }
  assertString(value.value, `${label}.value`);
  return { key: value.key, type: 'STRING', value: value.value };
}

function normalizeGateResult(value: unknown): GateResultPayload {
  assertExactKeys(value, ['schema', 'policyVersion', 'result', 'findings'], [], 'gateResult');
  assertLiteral(value.schema, 'monolith.factory.gate-result@2.0', 'gateResult.schema');
  assertSemver(value.policyVersion, 'gateResult.policyVersion');
  assertLiteral(value.result, 'PASS', 'gateResult.result');
  assertArray(value.findings, 'gateResult.findings');
  const findings: GateFinding[] = value.findings.map((finding, findingIndex) => {
    const label = `gateResult.findings[${findingIndex}]`;
    assertExactKeys(finding, ['code', 'severity', 'entityIds', 'parameters'], [], label);
    assertString(finding.code, `${label}.code`, { pattern: /^[A-Z][A-Z0-9_]{1,63}$/ });
    assertEnum(finding.severity, ['WARNING', 'INFO'] as const, `${label}.severity`);
    assertArray(finding.entityIds, `${label}.entityIds`);
    const entityIds = finding.entityIds.map((entityId, entityIndex) => {
      assertOpaqueId(entityId, `${label}.entityIds[${entityIndex}]`);
      return entityId;
    });
    assertArray(finding.parameters, `${label}.parameters`);
    const parameters = finding.parameters.map((parameter, parameterIndex) =>
      normalizeGateParameter(parameter, `${label}.parameters[${parameterIndex}]`),
    );
    parameters.sort((a, b) => compareUtf8(a.key, b.key));
    assertUniqueKey(parameters, (parameter) => parameter.key, `${label} parameter key`);
    return {
      code: finding.code,
      severity: finding.severity,
      entityIds: sortUniqueUtf8(entityIds, `${label}.entityIds`),
      parameters,
    };
  });
  findings.sort(compareGateFinding);
  assertUniqueKey(findings, (finding) => jcs(asJsonValue(finding)), 'gate finding');
  return {
    schema: 'monolith.factory.gate-result@2.0',
    policyVersion: value.policyVersion,
    result: 'PASS',
    findings,
  };
}

function compareGateFinding(a: GateFinding, b: GateFinding): number {
  const severity = (a.severity === 'WARNING' ? 0 : 1) - (b.severity === 'WARNING' ? 0 : 1);
  if (severity !== 0) return severity;
  const code = compareUtf8(a.code, b.code);
  if (code !== 0) return code;
  const entities = compareUtf8(jcs(asJsonValue(a.entityIds)), jcs(asJsonValue(b.entityIds)));
  if (entities !== 0) return entities;
  return compareUtf8(jcs(asJsonValue(a.parameters)), jcs(asJsonValue(b.parameters)));
}

function assertUniqueKey<T>(items: readonly T[], keyOf: (item: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} contains duplicate ${key}`);
    }
    seen.add(key);
  }
}

export function normalizePayloads(value: unknown): PacketPayloads {
  assertExactKeys(
    value,
    ['connectorOps', 'connectorsMinifix', 'cutlist', 'drillmap', 'gateResult'],
    [],
    'payloads',
  );
  return {
    connectorOps: normalizeConnectorOps(value.connectorOps),
    connectorsMinifix: normalizeConnectors(value.connectorsMinifix),
    cutlist: normalizeCutList(value.cutlist),
    drillmap: normalizeDrillMap(value.drillmap),
    gateResult: normalizeGateResult(value.gateResult),
  };
}
