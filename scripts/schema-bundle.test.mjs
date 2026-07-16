import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaRoot = join(repositoryRoot, 'docs', 'specs', 'schemas');

async function loadSchemas() {
  const names = (await readdir(schemaRoot))
    .filter((name) => name.endsWith('.schema.json'))
    .sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
  return Promise.all(names.map(async (name) => ({
    name,
    schema: JSON.parse(await readFile(join(schemaRoot, name), 'utf8')),
  })));
}

function visitSchema(node, location, findings) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  if (node.type === 'object' && node.additionalProperties !== false) {
    findings.push(`${location}: object schema is not closed`);
  }
  if (node.type === 'array' && !Array.isArray(node['x-monolith-orderBy'])) {
    findings.push(`${location}: array schema has no x-monolith-orderBy`);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'required' || key === 'enum' || key === 'x-monolith-orderBy') continue;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visitSchema(entry, `${location}/${key}/${index}`, findings));
    } else {
      visitSchema(value, `${location}/${key}`, findings);
    }
  }
}

test('schema bundle is closed and every payload array declares canonical order', async () => {
  const schemas = await loadSchemas();
  assert.equal(schemas.length, 10);
  const ids = new Set();
  const findings = [];
  for (const { name, schema } of schemas) {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', name);
    assert.equal(typeof schema.$id, 'string', name);
    assert(!ids.has(schema.$id), `duplicate schema ID: ${schema.$id}`);
    ids.add(schema.$id);
    visitSchema(schema, name, findings);
  }
  assert.deepEqual(findings, []);

  const attestation = schemas.find(({ name }) => name === 'packet-attestation.schema.json')?.schema;
  assert(attestation, 'packet-attestation schema is required');
  const protectedSignature = attestation.properties.signature.properties.protected;
  const signatureValue = attestation.properties.signature.properties.valueBase64;
  assert.equal(protectedSignature.properties.algorithm.const, 'ECDSA_P256_SHA256');
  assert.equal(signatureValue.pattern, '^[A-Za-z0-9+/]{85}[AQgw]==$');
  assert.equal(signatureValue['x-monolith-signatureEncoding'], 'IEEE_P1363_RAW_R_S_64_BYTES');
  assert.equal(signatureValue['x-monolith-requireLowS'], true);
  assert.equal(signatureValue['x-monolith-curve'], 'P-256');
  assert.equal(signatureValue['x-monolith-digest'], 'SHA-256');
  assert.equal(signatureValue['x-monolith-kmsSigningAlgorithm'], 'ECDSA_SHA_256');
});
