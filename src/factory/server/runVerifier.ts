/**
 * Run Verifier - Spawn & Capture Process Output
 * PR-P1.1-B.3 Real Verifier Integration
 *
 * Handles spawning monolith-verify process with:
 * - Timeout enforcement
 * - Log truncation (deterministic, from end)
 * - Cross-platform support (Windows/Linux)
 *
 * @version 0.12.0
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

export interface RunVerifierArgs {
  /** Absolute path to packet file */
  packetPath: string;
  /** Absolute path to verifier binary */
  verifierBin: string;
  /** Absolute path to production keys file */
  prodKeysPath: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Working directory (optional) */
  workdir?: string;
  /** Maximum log bytes before truncation */
  maxLogBytes: number;
}

export interface RunVerifierResult {
  /** Process exit code (null if killed) */
  exitCode: number;
  /** Captured stdout (may be truncated) */
  stdout: string;
  /** Captured stderr (may be truncated) */
  stderr: string;
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Whether process was killed due to timeout */
  timedOut: boolean;
  /** Whether output was truncated */
  truncated: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const TRUNCATION_MARKER = "\n...TRUNCATED (output exceeded limit)...\n";

// Exit codes for synthetic results
export const EXIT_CODE_TIMEOUT = 71;
export const EXIT_CODE_EXEC_ERROR = 70;

// ============================================================================
// Log Truncation
// ============================================================================

/**
 * Truncate log output from the end if it exceeds maxBytes.
 * Keeps the beginning (header) and truncates the end (details).
 *
 * This is deterministic: same input always produces same output.
 */
function truncateLog(log: string, maxBytes: number): { result: string; truncated: boolean } {
  const bytes = Buffer.byteLength(log, "utf8");

  if (bytes <= maxBytes) {
    return { result: log, truncated: false };
  }

  // Reserve space for truncation marker
  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, "utf8");
  const targetBytes = maxBytes - markerBytes;

  // Truncate from end, keeping the beginning
  // Find the last safe UTF-8 boundary
  let truncatedLength = 0;
  for (let i = 0; i < log.length; i++) {
    const charBytes = Buffer.byteLength(log.charAt(i), "utf8");
    if (truncatedLength + charBytes > targetBytes) {
      break;
    }
    truncatedLength++;
  }

  const truncated = log.substring(0, truncatedLength) + TRUNCATION_MARKER;
  return { result: truncated, truncated: true };
}

// ============================================================================
// Process Killing (Cross-platform)
// ============================================================================

/**
 * Kill a process and all its children (cross-platform)
 */
function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;

  try {
    if (process.platform === "win32") {
      // Windows: use taskkill to kill process tree
      spawn("taskkill", ["/pid", child.pid.toString(), "/T", "/F"], {
        detached: true,
        stdio: "ignore",
      });
    } else {
      // Unix: send SIGKILL to process group
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Fallback: kill just the process
        child.kill("SIGKILL");
      }
    }
  } catch {
    // Best effort - process may have already exited
    try {
      child.kill("SIGKILL");
    } catch {
      // Ignore
    }
  }
}

// ============================================================================
// Main Runner
// ============================================================================

/**
 * Run the monolith-verify process with the given arguments.
 *
 * Command: verifierBin verify packetPath --keys prodKeysPath
 *
 * Features:
 * - Timeout enforcement with process kill
 * - Output capture with truncation
 * - Cross-platform support
 *
 * @returns Result with exit code, stdout, stderr, and metadata
 */
export async function runVerifier(args: RunVerifierArgs): Promise<RunVerifierResult> {
  const {
    packetPath,
    verifierBin,
    prodKeysPath,
    timeoutMs,
    workdir,
    maxLogBytes,
  } = args;

  const startTime = Date.now();

  return new Promise((resolve) => {
    let timedOut = false;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let timeoutHandle: NodeJS.Timeout | null = null;

    // Build command arguments (no shell interpolation - secure)
    const spawnArgs = [
      "verify",
      packetPath,
      "--keys",
      prodKeysPath,
    ];

    // Spawn options
    const spawnOptions: Parameters<typeof spawn>[2] = {
      cwd: workdir || path.dirname(packetPath),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      // Create process group for clean kill on Unix
      detached: process.platform !== "win32",
    };

    let child: ChildProcess;

    try {
      child = spawn(verifierBin, spawnArgs, spawnOptions);
    } catch (err) {
      // Spawn itself failed (e.g., binary not found at runtime)
      const durationMs = Date.now() - startTime;
      resolve({
        exitCode: EXIT_CODE_EXEC_ERROR,
        stdout: "",
        stderr: `Spawn error: ${err instanceof Error ? err.message : String(err)}`,
        durationMs,
        timedOut: false,
        truncated: false,
      });
      return;
    }

    // Setup timeout
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);

    // Capture stdout
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
    });

    // Capture stderr
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString("utf8");
    });

    // Handle process exit
    child.on("close", (code) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      const durationMs = Date.now() - startTime;

      // Truncate logs if needed
      const { result: stdout, truncated: stdoutTruncated } = truncateLog(
        stdoutBuffer,
        maxLogBytes
      );
      const { result: stderr, truncated: stderrTruncated } = truncateLog(
        stderrBuffer,
        maxLogBytes / 4 // stderr gets smaller allocation
      );

      resolve({
        exitCode: timedOut ? EXIT_CODE_TIMEOUT : (code ?? EXIT_CODE_EXEC_ERROR),
        stdout,
        stderr,
        durationMs,
        timedOut,
        truncated: stdoutTruncated || stderrTruncated,
      });
    });

    // Handle spawn errors after process started
    child.on("error", (err) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      const durationMs = Date.now() - startTime;

      resolve({
        exitCode: EXIT_CODE_EXEC_ERROR,
        stdout: stdoutBuffer,
        stderr: `Process error: ${err.message}\n${stderrBuffer}`,
        durationMs,
        timedOut: false,
        truncated: false,
      });
    });
  });
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a result indicates the verifier binary was not found
 */
export function isVerifierMissing(result: RunVerifierResult): boolean {
  return (
    result.exitCode === EXIT_CODE_EXEC_ERROR &&
    (result.stderr.includes("ENOENT") ||
      result.stderr.includes("Spawn error") ||
      result.stderr.includes("not found"))
  );
}

/**
 * Check if a result indicates timeout
 */
export function isTimeout(result: RunVerifierResult): boolean {
  return result.timedOut || result.exitCode === EXIT_CODE_TIMEOUT;
}

/**
 * Combine stdout and stderr for logging
 */
export function combineOutput(result: RunVerifierResult): string {
  if (!result.stderr.trim()) {
    return result.stdout;
  }
  if (!result.stdout.trim()) {
    return result.stderr;
  }
  return `${result.stdout}\n\n---STDERR---\n${result.stderr}`;
}
