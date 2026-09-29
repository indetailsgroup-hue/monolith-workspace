"""Produce durable local-only browser evidence for the A1 Design Approval sandbox."""

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright


sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
CANONICAL_ARTIFACTS = ROOT / "artifacts" / "line-design-approval-a1"
PRODUCER_PATH = "tests/line-design-approval-browser-evidence.py"
PORT = 4179
URL = f"http://localhost:{PORT}/line-flex-studio.html"
PUBLISHED_FILENAMES = ("desktop-1440.png", "mobile-390.png", "browser-observed.json")
CANONICAL_RECORDED_DIRECTORY = "artifacts/line-design-approval-a1"
FORCED_FAILURE_ENV = "MONOLITH_LINEOS_A1_TEST_FAIL_AFTER_DESKTOP"
FORBIDDEN_FIELDS = [
    "tenant", "tenantid", "tenantassertion", "customer", "customerid", "customeridentity",
    "role", "recipient", "project", "projectid", "projectowner", "approvalstatus", "approved",
    "signature", "signaturestatus", "keyid", "privatekey", "publickey", "signingkey", "secret",
    "lineidtoken", "accesstoken",
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Capture local-only A1 browser evidence without implicit canonical writes."
    )
    output = parser.add_mutually_exclusive_group(required=True)
    output.add_argument(
        "--output-dir",
        type=Path,
        help="Existing isolated directory that receives browser-observed.json and both PNGs.",
    )
    output.add_argument(
        "--publish-canonical",
        action="store_true",
        help="Explicitly replace the canonical A1 raw browser evidence and screenshots.",
    )
    return parser.parse_args()


def resolve_output(args):
    canonical = CANONICAL_ARTIFACTS.resolve(strict=True)
    if args.publish_canonical:
        return canonical, "canonical"

    supplied = args.output_dir.expanduser().resolve(strict=True)
    if not supplied.is_dir():
        raise ValueError(f"output directory is not a directory: {supplied}")
    if supplied == canonical or canonical in supplied.parents:
        raise ValueError("canonical evidence requires --publish-canonical")
    if supplied == Path(supplied.anchor):
        raise ValueError("filesystem root is not an allowed evidence output directory")
    return supplied, "isolated"


def output_path(directory, filename):
    resolved_directory = directory.resolve(strict=True)
    candidate = (resolved_directory / filename).resolve()
    if candidate.parent != resolved_directory:
        raise ValueError(f"output escaped the explicitly supplied directory: {candidate}")
    return candidate


def transaction_directory(path, kind):
    canonical = CANONICAL_ARTIFACTS.resolve(strict=True)
    resolved = path.resolve(strict=True)
    expected_prefix = f"{canonical.name}.{kind}-"
    if resolved.parent != canonical.parent or not resolved.name.startswith(expected_prefix):
        raise ValueError(f"invalid {kind} transaction directory: {resolved}")
    return resolved


def create_transaction_directory(kind):
    canonical = CANONICAL_ARTIFACTS.resolve(strict=True)
    created = Path(tempfile.mkdtemp(
        prefix=f"{canonical.name}.{kind}-",
        dir=str(canonical.parent),
    ))
    return transaction_directory(created, kind)


def remove_transaction_directory(path, kind):
    if not path.exists():
        return
    resolved = transaction_directory(path, kind)
    entries = {entry.name: entry for entry in resolved.iterdir()}
    unexpected = sorted(set(entries) - set(PUBLISHED_FILENAMES))
    if unexpected:
        raise RuntimeError(f"unexpected files in {kind} transaction directory: {unexpected}")
    for filename in PUBLISHED_FILENAMES:
        candidate = entries.get(filename)
        if candidate is not None:
            if not candidate.is_file() and not candidate.is_symlink():
                raise RuntimeError(f"refusing to remove non-file transaction entry: {candidate}")
            candidate.unlink()
    resolved.rmdir()


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def canonical_lf_bytes(value):
    data = value.read_bytes() if isinstance(value, Path) else bytes(value)
    return data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def canonical_lf_identity(path):
    data = canonical_lf_bytes(path)
    return {
        "normalization": "canonical-lf",
        "canonicalLfBytes": len(data),
        "canonicalLfSha256": hashlib.sha256(data).hexdigest().upper(),
    }


def base_commit():
    result = subprocess.run(
        ["git", "-C", str(REPO), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        encoding="utf-8",
    )
    return result.stdout.strip()


def png_dimensions(path):
    data = path.read_bytes()
    assert_true(data[:8] == b"\x89PNG\r\n\x1a\n", f"invalid PNG signature: {path}")
    return struct.unpack(">II", data[16:24])


def duration_ms(value):
    values = []
    for part in value.split(","):
        part = part.strip()
        if part.endswith("ms"):
            values.append(float(part[:-2]))
        elif part.endswith("s"):
            values.append(float(part[:-1]) * 1000)
    return max(values or [0.0])


def assert_true(value, message):
    if not value:
        raise AssertionError(message)


def install_observers(page, events):
    page.on("request", lambda request: events["requests"].append({
        "url": request.url,
        "method": request.method,
        "resourceType": request.resource_type,
    }))
    page.on("requestfailed", lambda request: events["failedRequests"].append({
        "url": request.url,
        "failure": request.failure,
    }))
    page.on("response", lambda response: events["httpErrors"].append({
        "url": response.url,
        "status": response.status,
    }) if response.status >= 400 else None)
    page.on("console", lambda message: events["consoleErrors"].append({
        "type": message.type,
        "text": message.text,
    }) if message.type == "error" else None)
    page.on("pageerror", lambda error: events["pageErrors"].append({"message": str(error)}))


def choose_language(page, language):
    if page.locator("html").get_attribute("lang") != language:
        page.locator("#language-toggle").click()
        page.wait_for_function("language => document.documentElement.lang === language", arg=language)
    assert_true(page.locator("html").get_attribute("lang") == language, "language switch failed")


def tab_to(page, element_id, max_tabs=6):
    for _ in range(max_tabs):
        if page.evaluate("id => document.activeElement?.id === id", element_id):
            return
        page.keyboard.press("Tab")
    raise AssertionError(f"keyboard focus did not reach {element_id}")


def activate_mobile_pane(page, pane):
    tab = page.locator(f"[data-mobile-tabs] [data-pane='{pane}']")
    if tab.is_visible():
        tab.click()
        page.locator(f"#pane-{pane}").wait_for(state="visible")


def open_design_review(page, keyboard=False):
    activate_mobile_pane(page, "preview")
    run = page.locator("#run-journey")
    assert_true(run.is_enabled(), "run journey is unexpectedly disabled")
    if keyboard:
        run.focus()
        page.keyboard.press("Enter")
    else:
        run.click()
    page.locator("#liff-dialog[open]").wait_for(state="visible")


def confirm_design_review(page, keyboard=False):
    if keyboard:
        tab_to(page, "confirm-journey")
        page.keyboard.press("Enter")
    else:
        page.locator("#confirm-journey").click()
    page.locator("#receipt-dialog[open]").wait_for(state="visible")


def close_receipt(page, keyboard=False):
    if keyboard:
        tab_to(page, "close-receipt")
        page.keyboard.press("Enter")
    else:
        page.locator("#close-receipt").click()
    page.locator("#receipt-dialog").wait_for(state="hidden")
    page.wait_for_function("document.activeElement?.id === 'run-journey'")


def run_port_contract_probes(page):
    return page.evaluate(
        """async ({ forbiddenFields }) => {
          const { createSandboxDesignApprovalPort } = await import('./line-design-approval-sandbox.mjs');
          const { createSandboxVerificationRecord } = await import('./line-design-approval-record.mjs');
          const TOKEN = 'rvw_A1_7L3n9Q2pV8xK';
          const fixture = () => ({
            providerContext: 'Daph Studio · A1 sandbox fixture',
            scopeContext: 'Main kitchen review scope',
            workItemRef: 'work_item_demo_001',
            approvalRequestRef: 'approval_request_demo_001',
            revisionLabel: 'D-07',
            revisionId: 'a'.repeat(64),
            artifactManifestSha256: 'b'.repeat(64),
            canonicalizationVersion: 'line-design-approval-v1',
            expectedWorkflowVersion: 7,
            reviewArtifacts: [{
              kind: 'rendered_preview',
              label: 'Main kitchen perspective',
              uri: 'https://example.com/monolith/demo/artifacts/main-kitchen.png'
            }],
            requestedCanonicalAction: 'design.approve_revision',
            plainLanguageConsequence: 'Records a sandbox confirmation attempt only.',
            reviewTtlMs: 15 * 60 * 1000,
            fixtureIdentity: 'fx_A1_7L3n9Q2pV8xK'
          });
          const makeIds = () => {
            const counts = new Map();
            const prefixes = {
              reviewSessionId: 'review_session_demo_',
              serverIssuedIdempotencyKey: 'idempotency_demo_',
              recordId: 'record_demo_',
              correlationId: 'correlation_demo_'
            };
            return (kind) => {
              const next = (counts.get(kind) ?? 0) + 1;
              counts.set(kind, next);
              return prefixes[kind] + String(next).padStart(3, '0');
            };
          };
          const harness = () => {
            let now = '2026-08-03T03:00:00.000Z';
            const opened = fixture();
            let current = structuredClone(opened);
            const port = createSandboxDesignApprovalPort({
              clock: () => now,
              idFactory: makeIds(),
              fixtureSource: {
                async open(token) { return token === TOKEN ? opened : null; },
                async recheck() { return current; }
              },
              recordFactory: createSandboxVerificationRecord,
              ledger: new Map()
            });
            return {
              port,
              setCurrent(changes) { current = { ...current, ...changes }; },
              setNow(value) { now = value; }
            };
          };
          const inputFor = (snapshot) => ({
            reviewSessionId: snapshot.reviewSessionId,
            serverIssuedIdempotencyKey: snapshot.serverIssuedIdempotencyKey,
            expectedRevisionId: snapshot.revisionId,
            decision: 'confirm'
          });

          const successHarness = harness();
          const successSnapshot = await successHarness.port.openReview(TOKEN);
          const success = await successHarness.port.confirmReview(inputFor(successSnapshot));
          const replay = await successHarness.port.confirmReview(inputFor(successSnapshot));

          const staleHarness = harness();
          const staleSnapshot = await staleHarness.port.openReview(TOKEN);
          staleHarness.setCurrent({ revisionId: 'c'.repeat(64) });
          const stale = await staleHarness.port.confirmReview(inputFor(staleSnapshot));

          const expiredHarness = harness();
          const expiredSnapshot = await expiredHarness.port.openReview(TOKEN);
          expiredHarness.setNow(expiredSnapshot.expiresAt);
          const expired = await expiredHarness.port.confirmReview(inputFor(expiredSnapshot));

          const forbidden = new Set(forbiddenFields);
          const matches = [];
          const walk = (value, path = '$') => {
            if (!value || typeof value !== 'object') return;
            for (const key of Reflect.ownKeys(value)) {
              const normalized = typeof key === 'string'
                ? key.replace(/[^a-z0-9]/gi, '').toLowerCase()
                : String(key);
              if (forbidden.has(normalized)) matches.push(`${path}.${String(key)}`);
              walk(value[key], `${path}.${String(key)}`);
            }
          };
          walk(success.record);
          return {
            probes: {
              replay: { status: 'PASS', outcome: replay.outcome, errorCode: null },
              stale_revision: { status: 'PASS', outcome: stale.outcome, errorCode: stale.outcome },
              expired: { status: 'PASS', outcome: expired.outcome, errorCode: expired.outcome }
            },
            successOutcome: success.outcome,
            record: {
              digest: success.record.recordDigest,
              keys: Object.keys(success.record),
              forbiddenMatches: matches
            }
          };
        }""",
        {"forbiddenFields": FORBIDDEN_FIELDS},
    )


def run_matrix_cell(
    browser,
    language,
    width,
    events,
    output_directory,
    fail_after_desktop=False,
):
    height = 1000 if width == 1440 else 844
    context = browser.new_context(
        viewport={"width": width, "height": height},
        locale="th-TH" if language == "th" else "en-US",
    )
    page = context.new_page()
    install_observers(page, events)
    page.emulate_media(reduced_motion="reduce")
    page.goto(URL, wait_until="networkidle")
    choose_language(page, language)

    keyboard = language == "en" and width == 1440
    open_design_review(page, keyboard=keyboard)
    assert_true(page.locator("#liff-sandbox-warning").inner_text() == "SANDBOX — NO BUSINESS EFFECT", "sandbox warning missing")
    assert_true(page.locator("[data-review-mode]").inner_text() == "sandbox", "review mode is not sandbox")
    assert_true(page.locator("[data-business-effect]").inner_text() == "none", "business effect is not none")
    assert_true(len(page.locator("[data-artifact-manifest-sha256]").inner_text()) == 64, "manifest digest is unreadable")
    confirm_design_review(page, keyboard=keyboard)

    title = page.locator("#receipt-title").inner_text()
    receipt_text = page.locator("#receipt-dialog").inner_text()
    receipt_pairs = page.locator("[data-receipt] .review-pair").count()
    digest_values = page.locator("[data-receipt] .review-pair span").all_inner_texts()
    ui_success_outcome = page.locator("[data-review-outcome] span").inner_text()
    assert_true(ui_success_outcome == "sandbox_recorded", f"unexpected UI outcome: {ui_success_outcome}")
    assert_true(title == "Sandbox Verification Record — Demo · No Business Effect", "sandbox record title mismatch")
    assert_true("SANDBOX — NO BUSINESS EFFECT" in receipt_text, "record warning missing")
    assert_true("signature" in receipt_text.lower() or "ลายเซ็น" in receipt_text, "digest disclosure is not readable")
    assert_true(receipt_pairs == 18, f"expected 18 record rows, got {receipt_pairs}")
    assert_true(any(len(value.strip()) == 64 for value in digest_values), "record digest is not visible")
    dialog_metrics = page.locator("#receipt-dialog .sandbox-dialog-body").evaluate(
        "el => ({ overflow: Math.max(0, el.scrollWidth - el.clientWidth), fontSize: parseFloat(getComputedStyle(el).fontSize) })"
    )
    assert_true(dialog_metrics["overflow"] == 0, "record dialog has horizontal overflow")
    assert_true(dialog_metrics["fontSize"] >= 12, "record copy is too small")

    screenshot = None
    if language == "en" and width == 1440:
        screenshot = output_path(output_directory, "desktop-1440.png")
    elif language == "th" and width == 390:
        screenshot = output_path(output_directory, "mobile-390.png")
    if screenshot:
        page.screenshot(path=str(screenshot), full_page=False)
        if screenshot.name == "desktop-1440.png" and fail_after_desktop:
            raise RuntimeError("forced failure after staged desktop capture")

    close_receipt(page, keyboard=keyboard)
    focus_return_after_success = page.evaluate("document.activeElement?.id === 'run-journey'")

    open_design_review(page)
    page.locator("#cancel-journey").click()
    page.locator("#liff-dialog").wait_for(state="hidden")
    page.wait_for_function("document.activeElement?.id === 'run-journey'")
    focus_return_after_cancel = page.evaluate("document.activeElement?.id === 'run-journey'")

    activate_mobile_pane(page, "editor")
    page.locator("#preset-list .preset-card").nth(1).click()
    assert_true(page.locator("#preset-list .preset-card").nth(1).get_attribute("aria-pressed") == "true", "legacy preset was not selected")
    activate_mobile_pane(page, "preview")
    page.locator("#run-journey").click()
    page.locator("#liff-dialog[open]").wait_for(state="visible")
    assert_true(page.locator("[data-review-mode]").inner_text() == "demo", "legacy journey did not retain demo mode")
    page.locator("#confirm-journey").click()
    page.locator("#receipt-dialog[open]").wait_for(state="visible")
    legacy_title = page.locator("#receipt-title").inner_text()
    assert_true(legacy_title != "Sandbox Verification Record — Demo · No Business Effect", "legacy journey used Design Approval record")
    page.locator("#close-receipt").click()
    page.locator("#receipt-dialog").wait_for(state="hidden")

    port_contracts = run_port_contract_probes(page)
    assert_true(port_contracts["successOutcome"] == "sandbox_recorded", "probe setup did not record")
    assert_true(port_contracts["probes"] == {
        "replay": {"status": "PASS", "outcome": "sandbox_replayed", "errorCode": None},
        "stale_revision": {"status": "PASS", "outcome": "stale_revision", "errorCode": "stale_revision"},
        "expired": {"status": "PASS", "outcome": "expired", "errorCode": "expired"},
    }, f"unexpected port probes: {port_contracts['probes']}")
    assert_true(port_contracts["record"]["forbiddenMatches"] == [], "forbidden record fields found")

    document_overflow = page.evaluate("Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)")
    motion = page.locator("#run-journey").evaluate(
        "el => ({ animationDuration: getComputedStyle(el).animationDuration, transitionDuration: getComputedStyle(el).transitionDuration })"
    )
    animation_ms = duration_ms(motion["animationDuration"])
    transition_ms = duration_ms(motion["transitionDuration"])
    assert_true(animation_ms <= 0.01, f"reduced animation duration too high: {animation_ms}")
    assert_true(transition_ms <= 0.01, f"reduced transition duration too high: {transition_ms}")
    assert_true(document_overflow == 0, f"document overflow at {language}:{width}")
    assert_true(focus_return_after_success and focus_return_after_cancel, "dialog focus did not return")

    cell = {
        "language": language,
        "width": width,
        "uiJourneys": {
            "success": {"status": "PASS", "outcome": ui_success_outcome, "receiptTitle": title},
            "cancel": {"status": "PASS", "outcome": "cancelled_locally", "focusReturned": focus_return_after_cancel},
            "legacy_preset": {"status": "PASS", "outcome": "legacy_demo_receipt", "receiptTitle": legacy_title},
        },
        "portContractProbes": port_contracts["probes"],
        "horizontalOverflowPixels": document_overflow,
        "copyReadability": "PASS",
        "focusReturnAfterSuccess": focus_return_after_success,
        "focusReturnAfterCancel": focus_return_after_cancel,
        "recordRowCount": receipt_pairs,
        "reducedMotion": {
            "animationDuration": motion["animationDuration"],
            "transitionDuration": motion["transitionDuration"],
            "animationDurationMs": animation_ms,
            "transitionDurationMs": transition_ms,
        },
    }
    context.close()
    return cell, port_contracts


def capture_evidence(
    output_directory,
    output_mode,
    recorded_directory,
    fail_after_desktop=False,
):
    observation_path = output_path(output_directory, "browser-observed.json")
    events = {
        "requests": [],
        "failedRequests": [],
        "httpErrors": [],
        "consoleErrors": [],
        "pageErrors": [],
    }
    server = ThreadingHTTPServer(
        ("127.0.0.1", PORT),
        partial(QuietHandler, directory=str(ROOT)),
    )
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    shutdown_completed = False
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                matrix = []
                last_contract = None
                for language in ["en", "th"]:
                    for width in [1440, 390]:
                        cell, last_contract = run_matrix_cell(
                            browser,
                            language,
                            width,
                            events,
                            output_directory,
                            fail_after_desktop=fail_after_desktop,
                        )
                        matrix.append(cell)
                browser_version = browser.version
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=5)
        shutdown_completed = not server_thread.is_alive()

    parsed = [urlparse(item["url"]) for item in events["requests"]]
    hosts = sorted({item.hostname for item in parsed})
    external = [event for event, item in zip(events["requests"], parsed) if item.hostname != "localhost"]
    local_paths = sorted({unquote(item.path).lstrip("/") for item in parsed if item.hostname == "localhost"})
    assert_true(hosts == ["localhost"], f"unexpected request hosts: {hosts}")
    assert_true(len(events["requests"]) == 56, f"expected 56 request events, got {len(events['requests'])}")
    assert_true(external == [], f"external requests observed: {external}")
    for key in ["failedRequests", "httpErrors", "consoleErrors", "pageErrors"]:
        assert_true(events[key] == [], f"{key} observed: {events[key]}")
    assert_true(shutdown_completed, "local evidence server did not shut down")

    source_files = []
    for path in local_paths:
        file_path = ROOT / path
        assert_true(file_path.is_file(), f"requested local resource is not a file: {path}")
        source_files.append({
            "path": path.replace("\\", "/"),
            **canonical_lf_identity(file_path),
        })
    source_files.sort(key=lambda item: item["path"])
    manifest = "\n".join(
        f"{item['path']}\0{item['canonicalLfSha256']}\0{item['canonicalLfBytes']}"
        for item in source_files
    )
    source_snapshot_sha = hashlib.sha256(manifest.encode("utf-8")).hexdigest().upper()
    capture_commit = base_commit()

    screenshots = {}
    for name, filename in [("desktop1440", "desktop-1440.png"), ("mobile390", "mobile-390.png")]:
        path = output_path(output_directory, filename)
        width, height = png_dimensions(path)
        recorded_path = (
            f"artifacts/line-design-approval-a1/{filename}"
            if output_mode == "canonical"
            else filename
        )
        screenshots[name] = {
            "path": recorded_path,
            "sha256": sha256(path),
            "width": width,
            "height": height,
            "sourceSnapshotCanonicalLfSha256": source_snapshot_sha,
            "baseCommitAtCapture": capture_commit,
        }

    output = {
        "schemaVersion": 1,
        "capturedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "producer": {"path": PRODUCER_PATH, **canonical_lf_identity(Path(__file__))},
        "output": {
            "mode": output_mode,
            "directory": (
                CANONICAL_RECORDED_DIRECTORY
                if output_mode == "canonical"
                else str(recorded_directory.resolve(strict=True))
            ),
        },
        "server": {"host": "127.0.0.1", "port": PORT, "url": URL, "shutdownCompleted": shutdown_completed},
        "browserVersion": browser_version,
        "headless": True,
        "waitCondition": "networkidle",
        "matrix": matrix,
        "network": {"events": events},
        "sourceSnapshot": {
            "normalization": "canonical-lf",
            "canonicalLfSha256": source_snapshot_sha,
            "files": source_files,
        },
        "screenshots": screenshots,
        "recordForbiddenFieldScan": {
            "fields": FORBIDDEN_FIELDS,
            "occurrences": len(last_contract["record"]["forbiddenMatches"]),
            "matches": last_contract["record"]["forbiddenMatches"],
            "recordKeys": last_contract["record"]["keys"],
            "recordDigest": last_contract["record"]["digest"],
        },
    }
    observation_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return output


def validate_capture_set(directory, output_mode, recorded_directory):
    resolved = directory.resolve(strict=True)
    recorded = (
        CANONICAL_RECORDED_DIRECTORY
        if output_mode == "canonical"
        else str(recorded_directory.resolve(strict=True))
    )
    paths = {name: output_path(resolved, name) for name in PUBLISHED_FILENAMES}
    for name, path in paths.items():
        assert_true(path.is_file(), f"capture output is missing: {name}")

    raw = json.loads(paths["browser-observed.json"].read_text(encoding="utf-8"))
    assert_true(raw["output"] == {"mode": output_mode, "directory": recorded}, "capture output provenance mismatch")
    assert_true(raw["server"]["shutdownCompleted"] is True, "capture server did not shut down")
    assert_true(len(raw["matrix"]) == 4, "capture matrix is incomplete")
    observed_cells = {(cell["language"], cell["width"]) for cell in raw["matrix"]}
    assert_true(observed_cells == {("en", 1440), ("en", 390), ("th", 1440), ("th", 390)}, "capture matrix cells are incomplete")
    assert_true(raw["network"]["events"]["failedRequests"] == [], "failed browser requests found")
    assert_true(raw["network"]["events"]["httpErrors"] == [], "browser HTTP errors found")
    assert_true(raw["network"]["events"]["consoleErrors"] == [], "browser console errors found")
    assert_true(raw["network"]["events"]["pageErrors"] == [], "browser page errors found")
    assert_true(
        raw["producer"] == {"path": PRODUCER_PATH, **canonical_lf_identity(Path(__file__))},
        "producer provenance mismatch",
    )

    source_snapshot = raw["sourceSnapshot"]
    assert_true(source_snapshot["normalization"] == "canonical-lf", "source normalization mismatch")
    for item in source_snapshot["files"]:
        source_path = ROOT / item["path"]
        assert_true(
            item == {"path": item["path"], **canonical_lf_identity(source_path)},
            f"canonical-LF source identity mismatch: {item['path']}",
        )
    manifest = "\n".join(
        f"{item['path']}\0{item['canonicalLfSha256']}\0{item['canonicalLfBytes']}"
        for item in source_snapshot["files"]
    )
    assert_true(
        source_snapshot["canonicalLfSha256"]
        == hashlib.sha256(manifest.encode("utf-8")).hexdigest().upper(),
        "canonical-LF source manifest mismatch",
    )

    expected_screenshots = {
        "desktop1440": ("desktop-1440.png", 1440, 1000),
        "mobile390": ("mobile-390.png", 390, 844),
    }
    for key, (filename, expected_width, expected_height) in expected_screenshots.items():
        path = paths[filename]
        width, height = png_dimensions(path)
        screenshot = raw["screenshots"][key]
        recorded_path = f"artifacts/line-design-approval-a1/{filename}" if output_mode == "canonical" else filename
        assert_true((width, height) == (expected_width, expected_height), f"unexpected dimensions for {filename}")
        assert_true(screenshot["path"] == recorded_path, f"recorded path mismatch for {filename}")
        assert_true(screenshot["sha256"] == sha256(path), f"recorded hash mismatch for {filename}")
        assert_true(screenshot["width"] == width and screenshot["height"] == height, f"recorded dimensions mismatch for {filename}")
        assert_true(
            screenshot["sourceSnapshotCanonicalLfSha256"]
            == raw["sourceSnapshot"]["canonicalLfSha256"],
            f"source snapshot mismatch for {filename}",
        )
    return raw


def file_identity(path):
    stat = path.stat()
    return path.read_bytes(), stat.st_mtime_ns


def publish_capture(staging_directory):
    canonical = CANONICAL_ARTIFACTS.resolve(strict=True)
    staging = transaction_directory(staging_directory, "staging")
    validate_capture_set(staging, "canonical", canonical)
    canonical_paths = {name: output_path(canonical, name) for name in PUBLISHED_FILENAMES}
    before = {name: file_identity(path) for name, path in canonical_paths.items()}
    backup = create_transaction_directory("backup")
    publish_error = None
    try:
        for name, canonical_path in canonical_paths.items():
            shutil.copy2(canonical_path, output_path(backup, name))
        for name, canonical_path in canonical_paths.items():
            os.replace(output_path(staging, name), canonical_path)
        validate_capture_set(canonical, "canonical", canonical)
    except Exception as error:
        publish_error = error
        rollback_errors = []
        for name, canonical_path in canonical_paths.items():
            backup_path = output_path(backup, name)
            if backup_path.exists():
                try:
                    os.replace(backup_path, canonical_path)
                except Exception as rollback_error:
                    rollback_errors.append(f"{name}: {rollback_error}")
        changed = [
            name for name, path in canonical_paths.items()
            if file_identity(path) != before[name]
        ]
        if rollback_errors or changed:
            raise RuntimeError(
                f"canonical rollback failed; errors={rollback_errors}; changed={changed}"
            ) from error
        raise
    finally:
        try:
            remove_transaction_directory(backup, "backup")
        except Exception:
            if publish_error is None:
                raise


def main(args):
    requested_directory, output_mode = resolve_output(args)
    if output_mode == "isolated":
        output = capture_evidence(
            requested_directory,
            output_mode,
            requested_directory,
        )
        validate_capture_set(requested_directory, output_mode, requested_directory)
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return

    canonical = CANONICAL_ARTIFACTS.resolve(strict=True)
    staging = create_transaction_directory("staging")
    try:
        output = capture_evidence(
            staging,
            "canonical",
            canonical,
            fail_after_desktop=os.environ.get(FORCED_FAILURE_ENV) == "1",
        )
        validate_capture_set(staging, "canonical", canonical)
        publish_capture(staging)
        print(json.dumps(output, ensure_ascii=False, indent=2))
    finally:
        remove_transaction_directory(staging, "staging")


if __name__ == "__main__":
    main(parse_args())
