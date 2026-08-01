import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CURRENT_RECORD_RESULT_IDENTITY =
  "public.rpc_record_line_send_result(uuid,text,text,text,uuid)";
const LEGACY_RECORD_RESULT_IDENTITY =
  "public.rpc_record_line_send_result(uuid,text,text)";

function dependencyProbeBlock(path: string): string {
  const source = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  const start = source.indexOf("for proc in (");
  const end = source.indexOf("):", start);
  expect(start, `${path} dependency probe start`).toBeGreaterThanOrEqual(0);
  expect(end, `${path} dependency probe end`).toBeGreaterThan(start);
  return source.slice(start, end);
}

function recordFailureHelper(path: string): string {
  const source = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  const start = source.indexOf("def _record_failure(");
  const end = source.indexOf("\n\ndef ", start + 1);
  expect(start, `${path} record helper start`).toBeGreaterThanOrEqual(0);
  expect(end, `${path} record helper end`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("LINE OA property-suite RPC dependency probes", () => {
  it.each([
    "tests/line-oa-commerce/py/test_failure_handling_property.py",
    "tests/line-oa-commerce/py/test_secret_non_exposure_property.py",
  ])("probes the current record-result identity in %s", (path) => {
    const probe = dependencyProbeBlock(path);

    expect(probe).toContain(CURRENT_RECORD_RESULT_IDENTITY);
    expect(probe).not.toContain(LEGACY_RECORD_RESULT_IDENTITY);
  });

  it.each([
    "tests/line-oa-commerce/py/test_failure_handling_property.py",
    "tests/line-oa-commerce/py/test_secret_non_exposure_property.py",
  ])("classifies the terminal failure property explicitly in %s", (path) => {
    const helper = recordFailureHelper(path);

    expect(helper).toContain(
      "rpc_record_line_send_result(%s, %s, %s, %s, %s)",
    );
    expect(helper).toContain(
      '(outbound_id, "failed", error_detail, "permanent", None)',
    );
  });
});
