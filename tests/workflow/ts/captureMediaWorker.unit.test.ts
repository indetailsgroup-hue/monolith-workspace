// Feature: installation-pm 1.4 (0099) — capture-media-worker: ดึงรูปจาก LINE เข้า Storage + baseline bytes
import { describe, it, expect, vi } from "vitest";
import {
  runMediaWorker,
  storagePathFor,
  type MediaWorkerDeps,
  type MediaFetchJob,
} from "../../../supabase/functions/capture-media-worker/index";

function job(id: string, over: Partial<MediaFetchJob> = {}): MediaFetchJob {
  return {
    artifact_id: id,
    line_message_id: `msg-${id}`,
    site_code: "BKK-HQ-01",
    token_ref: "line-token-ref",
    ...over,
  };
}

function makeDeps(jobs: MediaFetchJob[], over: Partial<MediaWorkerDeps> = {}) {
  const recorded: unknown[][] = [];
  const uploaded: string[] = [];
  const deps: MediaWorkerDeps = {
    claim: async () => jobs,
    resolveToken: async () => "secret-token",
    fetchLineContent: async () => ({ bytes: new Uint8Array(1024), contentType: "image/jpeg" }),
    uploadToStorage: async (path) => {
      uploaded.push(path);
    },
    recordResult: async (...args) => {
      recorded.push(args);
    },
    ...over,
  };
  return { deps, recorded, uploaded };
}

describe("storagePathFor — path คีย์ด้วย artifact id (idempotent upsert)", () => {
  it("แยก ext ตาม content-type + แยกโฟลเดอร์ตาม site", () => {
    expect(storagePathFor(job("a1"), "image/jpeg")).toBe("inst/BKK-HQ-01/a1.jpg");
    expect(storagePathFor(job("a2"), "image/png")).toBe("inst/BKK-HQ-01/a2.png");
    expect(storagePathFor(job("a3"), "video/mp4")).toBe("inst/BKK-HQ-01/a3.mp4");
    expect(storagePathFor(job("a4", { site_code: null }), "image/jpeg")).toBe("inst/no-site/a4.jpg");
  });
});

describe("runMediaWorker", () => {
  it("happy path: fetch → upload → record พร้อม bytes (baseline D-4)", async () => {
    const { deps, recorded, uploaded } = makeDeps([job("a1"), job("a2")]);
    const summary = await runMediaWorker(deps);
    expect(summary).toEqual({ claimed: 2, fetched: 2, failed: 0, totalBytes: 2048 });
    expect(uploaded).toEqual(["inst/BKK-HQ-01/a1.jpg", "inst/BKK-HQ-01/a2.jpg"]);
    expect(recorded[0]).toEqual(["a1", "inst/BKK-HQ-01/a1.jpg", 1024, "image/jpeg", null]);
  });

  it("LINE content หมดอายุ (404) → record error, job อื่นไปต่อ", async () => {
    const { deps, recorded } = makeDeps([job("gone"), job("ok")], {
      fetchLineContent: async (messageId) => {
        if (messageId === "msg-gone") throw new Error("line_content_http_404");
        return { bytes: new Uint8Array(10), contentType: "image/jpeg" };
      },
    });
    const summary = await runMediaWorker(deps);
    expect(summary.fetched).toBe(1);
    expect(summary.failed).toBe(1);
    expect(recorded[0]).toEqual(["gone", null, null, null, "line_content_http_404"]);
  });

  it("token resolve ไม่ได้ → failed พร้อมเหตุผล (ไม่ throw ทั้ง batch)", async () => {
    const { deps, recorded } = makeDeps([job("a1", { token_ref: null })]);
    const summary = await runMediaWorker(deps);
    expect(summary.failed).toBe(1);
    expect(recorded[0]?.[4]).toBe("channel_token_ref_missing");
  });

  it("upload พัง → record error (งานคงในคิว attempts+1 ฝั่ง DB)", async () => {
    const { deps, recorded } = makeDeps([job("a1")], {
      uploadToStorage: async () => {
        throw new Error("storage_upload_failed:bucket_missing");
      },
    });
    const summary = await runMediaWorker(deps);
    expect(summary.failed).toBe(1);
    expect(String(recorded[0]?.[4])).toContain("storage_upload_failed");
  });

  it("recordResult ล้มเหลวหลัง fetch fail → ไม่ throw (งานรอบหน้าลองใหม่)", async () => {
    const record = vi.fn().mockRejectedValue(new Error("db down"));
    const { deps } = makeDeps([job("a1")], {
      fetchLineContent: async () => {
        throw new Error("line_content_http_500");
      },
      recordResult: record,
    });
    await expect(runMediaWorker(deps)).resolves.toMatchObject({ failed: 1 });
  });

  it("ไม่มีงาน → summary ศูนย์ ไม่แตะ deps อื่น", async () => {
    const fetchSpy = vi.fn();
    const { deps } = makeDeps([], { fetchLineContent: fetchSpy });
    expect(await runMediaWorker(deps)).toEqual({ claimed: 0, fetched: 0, failed: 0, totalBytes: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
