export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type Face = 'A' | 'B' | 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

export interface VectorUm {
  xUm: number;
  yUm: number;
  zUm: number;
}

export interface DirectionMicro {
  xMicro: number;
  yMicro: number;
  zMicro: number;
}

export interface MachineProfileDescriptor {
  schema: 'monolith.machine-profile@1.0';
  id: 'kdt_mvp_v1';
  version: '1.0.0';
  units: 'um';
  parameters: {
    bedWidthUm: number;
    bedLengthUm: number;
    maxPanelThicknessUm: number;
    minBoreDiameterUm: number;
    maxBoreDiameterUm: number;
    supportedFaces: Face[];
  };
}

export interface ReleasedRevision {
  projectId: string;
  revisionId: string;
  state: 'RELEASED';
}

export interface ExporterIdentity {
  id: 'monolith.factory-exporter';
  version: string;
  buildCommit: string;
  artifactSha256: string;
}

export interface CutListPart {
  partId: string;
  cabinetId: string;
  materialId: string;
  quantity: number;
  finishWidthUm: number;
  finishHeightUm: number;
  cutWidthUm: number;
  cutHeightUm: number;
  thicknessUm: number;
  grain: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  edgeBandUm: EdgeValuesUm;
  premillUm: EdgeValuesUm;
}

export interface EdgeValuesUm {
  leftUm: number;
  rightUm: number;
  topUm: number;
  bottomUm: number;
}

export interface CutListPayload {
  schema: 'monolith.factory.cutlist@2.0';
  parts: CutListPart[];
}

export interface DrillPoint {
  pointId: string;
  positionUm: VectorUm;
  directionMicro: DirectionMicro;
  diameterUm: number;
  depthUm: number;
  throughHole: boolean;
  purpose:
    | 'CAM_LOCK'
    | 'BOLT'
    | 'BOLT_ENTRY'
    | 'BOLT_THREAD'
    | 'DOWEL'
    | 'SHELF_PIN'
    | 'HINGE'
    | 'MINIFIX'
    | 'DRAWER_SLIDE'
    | 'OTHER';
  componentType: 'HOUSING' | 'BOLT' | 'DOWEL' | 'PIN' | 'HINGE' | 'SLIDE_HOLE' | 'OTHER';
  face: Face;
  status: 'VALID' | 'WARNING' | 'ERROR';
  pairId?: string;
  pairedPointId?: string;
}

export interface DrillPanel {
  panelId: string;
  cabinetId: string;
  role: string;
  dimensionsUm: {
    widthUm: number;
    heightUm: number;
    thicknessUm: number;
  };
  points: DrillPoint[];
}

export interface DrillMapPayload {
  schema: 'monolith.factory.drillmap@2.0';
  panels: DrillPanel[];
}

export interface ConnectorMember {
  pointId: string;
  panelId: string;
  positionUm: VectorUm;
  directionMicro: DirectionMicro;
  diameterUm: number;
  depthUm: number;
}

export interface MinifixPair {
  pairId: string;
  connectorId: string;
  cam: ConnectorMember;
  bolt: ConnectorMember;
}

export interface ConnectorsMinifixPayload {
  schema: 'monolith.factory.connectors-minifix@2.0';
  pairs: MinifixPair[];
}

export interface ConnectorOperation {
  operationId: string;
  panelId: string;
  pairId: string;
  featureId: string;
  type: 'DRILL';
  face: Face;
  positionUm: VectorUm;
  directionMicro: DirectionMicro;
  diameterUm: number;
  depthUm: number;
  tags: string[];
}

export interface ConnectorOpsPayload {
  schema: 'monolith.factory.connector-ops@2.0';
  operations: ConnectorOperation[];
}

export type GateParameter =
  | { key: string; type: 'BOOLEAN'; value: boolean }
  | { key: string; type: 'INTEGER'; value: number }
  | { key: string; type: 'STRING'; value: string };

export interface GateFinding {
  code: string;
  severity: 'WARNING' | 'INFO';
  entityIds: string[];
  parameters: GateParameter[];
}

export interface GateResultPayload {
  schema: 'monolith.factory.gate-result@2.0';
  policyVersion: string;
  result: 'PASS';
  findings: GateFinding[];
}

export interface PacketPayloads {
  connectorOps: ConnectorOpsPayload;
  connectorsMinifix: ConnectorsMinifixPayload;
  cutlist: CutListPayload;
  drillmap: DrillMapPayload;
  gateResult: GateResultPayload;
}

export interface ManifestFileEntryV2 {
  path: string;
  mediaType: 'application/json' | 'text/plain; charset=utf-8';
  contentSchema: string;
  sizeBytes: number;
  sha256: string;
}

export interface ManifestMachineProfile {
  id: string;
  version: string;
  sha256: string;
}

export interface PacketManifestDescriptorV2 {
  schema: 'monolith.factory.packet@2.0';
  manifestVersion: '2.0.0';
  releasedRevision: ReleasedRevision;
  machineProfile: ManifestMachineProfile;
  exporter: ExporterIdentity;
  files: ManifestFileEntryV2[];
}

export interface PacketManifestV2 extends PacketManifestDescriptorV2 {
  packetContentId: string;
}

export interface ProtectedSignatureHeader {
  algorithm: 'ECDSA_P256_SHA256';
  keyId: string;
  registryVersion: string;
}

export interface UnsignedPacketAttestationV2 {
  schema: 'monolith.factory.packet-attestation@1.0';
  jobRunId: string;
  packetContentId: string;
  manifestSha256: string;
  issuedAt: string;
  actorSubjectId: string;
  authorizationContextId: string;
  idempotencyFingerprint: string;
  releasedRevision: ReleasedRevision;
  machineProfile: ManifestMachineProfile;
  exporter: ExporterIdentity;
  packetSchema: 'monolith.factory.packet@2.0';
  gate: {
    result: 'PASS';
    policyVersion: string;
    evidenceFile: 'gate-result.json';
    evidenceSha256: string;
  };
  signature: {
    protected: ProtectedSignatureHeader;
  };
}

export interface PacketAttestationV2 extends Omit<UnsignedPacketAttestationV2, 'signature'> {
  signature: {
    protected: ProtectedSignatureHeader;
    valueBase64: string;
  };
}

export interface CanonicalPacketContentInput {
  releasedRevision: ReleasedRevision;
  machineProfile: MachineProfileDescriptor;
  exporter: ExporterIdentity;
  payloads: PacketPayloads;
}

export interface CanonicalPacketContent {
  manifest: PacketManifestV2;
  manifestBytes: Uint8Array;
  manifestSha256: string;
  machineProfileSha256: string;
  packetContentId: string;
  payloadBytes: ReadonlyMap<string, Uint8Array>;
  fileEntries: readonly ManifestFileEntryV2[];
}

export interface ServerRunContext {
  jobRunId: string;
  issuedAt: string;
  actorSubjectId: string;
  authorizationContextId: string;
  idempotencyFingerprint: string;
}

export interface PacketSigningRequest {
  keyId: string;
  keySpec: 'ECC_NIST_P256';
  signingAlgorithm: 'ECDSA_SHA_256';
  messageType: 'DIGEST';
  messageDigest: Uint8Array;
}

/**
 * Port implemented by the S17-6 AWS KMS integration. S17-4 never receives a
 * private key and only accepts the DER ECDSA signature returned by KMS Sign.
 */
export interface PacketSignerAdapter {
  signDigest(request: PacketSigningRequest): Promise<Uint8Array>;
}

export interface PacketSigningIdentity {
  keyId: string;
  registryVersion: string;
}

export interface GeneratedFactoryPacketV2 {
  filename: string;
  packetContentId: string;
  manifestSha256: string;
  manifest: PacketManifestV2;
  attestation: PacketAttestationV2;
  manifestBytes: Uint8Array;
  attestationBytes: Uint8Array;
  payloadBytes: ReadonlyMap<string, Uint8Array>;
  zipBytes: Uint8Array;
}

export interface ExportRunClaimInput {
  idempotencyKey: string;
  idempotencyFingerprint: string;
  packetContentId: string;
  actorSubjectId: string;
  authorizationContextId: string;
  releasedRevision: ReleasedRevision;
  machineProfile: ManifestMachineProfile;
  exporter: ExporterIdentity;
}

export interface ExportRunRecord extends ExportRunClaimInput {
  jobRunId: string;
  issuedAt: string;
  state: 'ALLOCATED' | 'COMPLETED' | 'FAILED';
}

export interface ExportRunClaim {
  kind: 'ALLOCATED' | 'REUSED';
  record: ExportRunRecord;
  completedPacket?: GeneratedFactoryPacketV2;
}

export interface ExportRunStore {
  claim(input: ExportRunClaimInput): Promise<ExportRunClaim>;
  complete(jobRunId: string, packet: GeneratedFactoryPacketV2): Promise<void>;
  fail(jobRunId: string): Promise<void>;
}

export interface AuthorizedPacketExport {
  actorSubjectId: string;
  authorizationContextId: string;
  content: CanonicalPacketContentInput;
}

export interface PacketExportRequest {
  idempotencyKey: string;
  authorized: AuthorizedPacketExport;
  signingIdentity: PacketSigningIdentity;
}
