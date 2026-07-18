/**
 * @vitest-environment jsdom
 */

// S18 L2 Slice 3: PASS_WITH_WARN must follow ONE rule everywhere — export
// unlocks (type contract: "can produce but with warning") and the operator
// sees an amber banner explaining the warning instead of silence.

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExportLockBanner, isVerifyPassed } from "../ExportLockBanner";
import type { VerifyApiResponse } from "../../../types/job";

function verifyResult(
  verdict: VerifyApiResponse["verdict"],
  code: VerifyApiResponse["code"] = "OK"
): VerifyApiResponse {
  return {
    verdict,
    code,
    summary: "summary",
    log: "log",
    timestamp: new Date().toISOString(),
    checks: [],
  };
}

describe("isVerifyPassed — single unlock rule (S18 L2 Slice 3)", () => {
  it("unlocks on PASS, PASS_WITH_WARN, STORAGE_HASH_MATCH only", () => {
    expect(isVerifyPassed(null)).toBe(false);
    expect(isVerifyPassed(verifyResult("FAIL", "E_GATE_DEPTH"))).toBe(false);
    expect(isVerifyPassed(verifyResult("ERROR", "E_VERIFY_CRASH"))).toBe(false);
    expect(isVerifyPassed(verifyResult("PASS"))).toBe(true);
    expect(isVerifyPassed(verifyResult("PASS_WITH_WARN", "W_AUDIT_UNKNOWN"))).toBe(
      true
    );
    expect(isVerifyPassed(verifyResult("STORAGE_HASH_MATCH"))).toBe(true);
  });
});

describe("ExportLockBanner — WARN case (S18 L2 Slice 3)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders an amber warning banner (not a lock) for PASS_WITH_WARN", () => {
    render(
      <ExportLockBanner
        verifyResult={verifyResult("PASS_WITH_WARN", "W_AUDIT_UNKNOWN")}
        jobStatus="VERIFIED"
      />
    );

    expect(screen.queryByText("Export Locked")).toBeNull();
    expect(screen.getByText(/with warning/i)).toBeInTheDocument();
    expect(screen.getByText(/W_AUDIT_UNKNOWN/)).toBeInTheDocument();
  });

  it("still locks on FAIL", () => {
    render(
      <ExportLockBanner
        verifyResult={verifyResult("FAIL", "E_GATE_DEPTH")}
        jobStatus="VERIFIED"
      />
    );

    expect(screen.getByText("Export Locked")).toBeInTheDocument();
    expect(screen.queryByText(/with warning/i)).toBeNull();
  });

  it("renders nothing for clean PASS", () => {
    const { container } = render(
      <ExportLockBanner verifyResult={verifyResult("PASS")} jobStatus="VERIFIED" />
    );
    expect(container.firstChild).toBeNull();
  });
});
