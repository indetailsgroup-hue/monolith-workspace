export const PACKET_SCHEMA = 'monolith.factory.packet@2.0' as const;
export const MANIFEST_VERSION = '2.0.0' as const;
export const ATTESTATION_SCHEMA = 'monolith.factory.packet-attestation@1.0' as const;

export const MACHINE_PROFILE_DIGEST_DOMAIN = 'MONOLITH_MACHINE_PROFILE_V1\n';
export const EXPORT_REQUEST_DIGEST_DOMAIN = 'MONOLITH_EXPORT_REQUEST_V1\n';
export const ATTESTATION_SIGNATURE_DOMAIN = 'MONOLITH_FACTORY_PACKET_ATTESTATION_V1\n';

export const NOT_FOR_PRODUCTION_PATH = 'NOT_FOR_PRODUCTION.txt' as const;

export const NOT_FOR_PRODUCTION_NOTICE = [
  '*** NOT FOR PRODUCTION — ห้ามใช้ตัดชิ้นงานจริง ***',
  '',
  'packet นี้ออกในโหมด shadow ระหว่างช่วง dogfood (ADR-065 Q3)',
  'ห้ามนำไปตัดชิ้นงานจริงจนกว่า S17 production blockers จะปิดครบ',
  'และ gate "ตัดจริง" ผ่านทั้งสี่เงื่อนไข (ดู ADR-065)',
  '',
  'This packet was produced in shadow mode during the dogfood phase.',
  'Do NOT cut real workpieces from it until all S17 production',
  'blockers are closed and the four-condition real-cut gate passes.',
  '',
  'ใช้ได้เฉพาะ: เทียบกับใบสั่งผลิตเดิมของโรงงานเพื่อเก็บ evidence ป้อน S17',
].join('\n');

export const NOT_FOR_PRODUCTION_SIZE_BYTES = 824;
export const NOT_FOR_PRODUCTION_SHA256 =
  '40a4d63fccde43c92e2f9ca3a0284db61254cd5b03d5eac072f33b2dc507d68a';

export const PAYLOAD_METADATA = {
  'connector-ops.json': {
    mediaType: 'application/json',
    contentSchema: 'monolith.factory.connector-ops@2.0',
  },
  'connectors.minifix.json': {
    mediaType: 'application/json',
    contentSchema: 'monolith.factory.connectors-minifix@2.0',
  },
  'cutlist.json': {
    mediaType: 'application/json',
    contentSchema: 'monolith.factory.cutlist@2.0',
  },
  'drillmap.json': {
    mediaType: 'application/json',
    contentSchema: 'monolith.factory.drillmap@2.0',
  },
  'gate-result.json': {
    mediaType: 'application/json',
    contentSchema: 'monolith.factory.gate-result@2.0',
  },
  [NOT_FOR_PRODUCTION_PATH]: {
    mediaType: 'text/plain; charset=utf-8',
    contentSchema: 'monolith.factory.nfp-marker@1.0',
  },
} as const;

export const P256_ORDER = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
export const P256_HALF_ORDER = BigInt('0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCE5617E3192A8');

export const ZIP_PROFILE = {
  maxEntries: 32,
  maxEntryBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxPathBytes: 128,
  utf8Flag: 0x0800,
  versionNeeded: 20,
  versionMadeBy: 0x031e,
  dosDate: 0x0021,
  dosTime: 0x0000,
  externalAttributes: 0x81a40000,
} as const;
