// Feature: monolith-mcp-layer — I/O schema validation + round-trip (Req 13)
// Pure; รองรับ JSON-schema subset ที่ seed ใน mcp_tool_registry (type/required/properties/enum).
// round-trip (Req 13.4/13.5): serialize→parse (และ parse→serialize) ต้องเทียบเท่าค่าเดิม.

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  required?: readonly string[];
  properties?: Record<string, JsonSchema>;
  enum?: readonly JsonValue[];
}

export type ValidationResult = { ok: true } | { ok: false; errors: readonly string[] };

function typeOf(v: JsonValue): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v; // 'object' | 'string' | 'number' | 'boolean'
}

function matchesType(v: JsonValue, t: NonNullable<JsonSchema['type']>): boolean {
  if (t === 'integer') return typeof v === 'number' && Number.isInteger(v);
  if (t === 'number') return typeof v === 'number';
  return typeOf(v) === t;
}

/**
 * Req 13.1/13.2 — validate value กับ schema. input ไม่ตรง schema → ok:false (caller reject).
 * รองรับ nested object/properties + required + enum.
 */
export function validate(value: JsonValue, schema: JsonSchema, path = '$'): ValidationResult {
  const errors: string[] = [];

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}, got ${typeOf(value)}`);
    return { ok: false, errors }; // type ผิด → หยุด (nested check ไร้ความหมาย)
  }

  if (schema.enum !== undefined) {
    const inEnum = schema.enum.some((e) => canonicalize(e) === canonicalize(value));
    if (!inEnum) errors.push(`${path}: value not in enum`);
  }

  if ((schema.type === 'object' || schema.properties || schema.required) && typeOf(value) === 'object') {
    const obj = value as Record<string, JsonValue>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: required`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj) {
        const r = validate(obj[key], sub, `${path}.${key}`);
        if (!r.ok) errors.push(...r.errors);
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * canonical serialization — key เรียงลำดับ (deterministic) เพื่อให้ round-trip + เทียบเท่าเสถียร.
 */
export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

/**
 * Req 13.4/13.5 — round-trip: serialize→parse→serialize ต้องได้ canonical เดิม.
 * คืน true ถ้าค่าผ่าน round-trip แบบ value-equivalent.
 */
export function roundTrips(value: JsonValue): boolean {
  const once = canonicalize(value);
  const parsed = JSON.parse(JSON.stringify(value)) as JsonValue;
  return canonicalize(parsed) === once;
}
