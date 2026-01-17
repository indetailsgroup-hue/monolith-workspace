/**
 * Verifier Paths Resolver - Path Resolution & Validation
 * PR-P1.1-B.3 Real Verifier Integration
 *
 * Handles secure path resolution for verifier binary, keys, and job packets.
 * Includes path traversal protection.
 *
 * @version 0.12.0
 */

import * as path from "path";
import * as fs from "fs";
import { getVerifyConfig } from "./verifyConfig";

// ============================================================================
// Path Errors
// ============================================================================

export class VerifierMissingError extends Error {
  constructor(path: string) {
    super(`Verifier binary not found: ${path}`);
    this.name = "VerifierMissingError";
  }
}

export class KeysMissingError extends Error {
  constructor(path: string) {
    super(`Production keys file not found: ${path}`);
    this.name = "KeysMissingError";
  }
}

export class PacketNotFoundError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly expectedPath: string
  ) {
    super(`Packet not found for job ${jobId}: ${expectedPath}`);
    this.name = "PacketNotFoundError";
  }
}

export class PathTraversalError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly attemptedPath: string
  ) {
    super(`Path traversal attempt detected for job ${jobId}`);
    this.name = "PathTraversalError";
  }
}

export class InvalidJobIdError extends Error {
  constructor(public readonly jobId: string) {
    super(`Invalid job ID format: ${jobId}`);
    this.name = "InvalidJobIdError";
  }
}

// ============================================================================
// Job ID Validation
// ============================================================================

/**
 * Regex for valid job IDs.
 * Allows: uppercase letters, digits, hyphens, underscores
 * Length: 6-64 characters
 */
const JOB_ID_REGEX = /^[A-Z0-9\-_]{6,64}$/;

/**
 * Validate job ID format (security: prevent injection)
 */
export function validateJobId(jobId: string): void {
  if (!JOB_ID_REGEX.test(jobId)) {
    throw new InvalidJobIdError(jobId);
  }
}

/**
 * Check if job ID is valid (non-throwing)
 */
export function isValidJobId(jobId: string): boolean {
  return JOB_ID_REGEX.test(jobId);
}

// ============================================================================
// File System Helpers
// ============================================================================

/**
 * Check if file exists and is readable (async)
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if file exists and is readable (sync)
 */
export function fileExistsSync(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Assert file is readable, throw typed error if not
 */
export async function assertReadableFile(
  filePath: string,
  errorFactory: (path: string) => Error
): Promise<void> {
  const exists = await fileExists(filePath);
  if (!exists) {
    throw errorFactory(filePath);
  }
}

// ============================================================================
// Path Resolution Functions
// ============================================================================

/**
 * Resolve and validate verifier binary path
 */
export function resolveVerifierBin(): string {
  const config = getVerifyConfig();
  const binPath = config.verifierBinPath;

  if (!fileExistsSync(binPath)) {
    throw new VerifierMissingError(binPath);
  }

  return binPath;
}

/**
 * Resolve and validate production keys path
 */
export function resolveProdKeys(): string {
  const config = getVerifyConfig();
  const keysPath = config.prodKeysPath;

  if (!fileExistsSync(keysPath)) {
    throw new KeysMissingError(keysPath);
  }

  return keysPath;
}

/**
 * Get the expected packet path for a job ID.
 * Does NOT verify the file exists - use validatePacketPath for that.
 */
export function getJobPacketDir(jobId: string): string {
  validateJobId(jobId);
  const config = getVerifyConfig();
  return path.join(config.jobStorageRoot, jobId);
}

/**
 * Get the packet file path for a job ID.
 * Standard packet filename: packet.json
 */
export function getJobPacketPath(jobId: string): string {
  const jobDir = getJobPacketDir(jobId);
  return path.join(jobDir, "packet.json");
}

/**
 * Validate that a packet path is safe (under job storage root)
 * and the file exists.
 *
 * Security: Prevents path traversal attacks
 */
export async function validatePacketPath(
  jobId: string,
  packetPath: string
): Promise<void> {
  const config = getVerifyConfig();
  const resolvedPath = path.resolve(packetPath);
  const storageRoot = path.resolve(config.jobStorageRoot);

  // Security: Ensure path is under storage root
  if (!resolvedPath.startsWith(storageRoot + path.sep)) {
    throw new PathTraversalError(jobId, packetPath);
  }

  // Validate file exists
  const exists = await fileExists(resolvedPath);
  if (!exists) {
    throw new PacketNotFoundError(jobId, resolvedPath);
  }
}

/**
 * Get validated packet path for a job.
 * This is the main entry point for getting a job's packet path.
 *
 * @throws InvalidJobIdError if job ID format is invalid
 * @throws PacketNotFoundError if packet file doesn't exist
 * @throws PathTraversalError if path escapes storage root
 */
export async function getValidatedPacketPath(jobId: string): Promise<string> {
  validateJobId(jobId);

  const packetPath = getJobPacketPath(jobId);
  await validatePacketPath(jobId, packetPath);

  return packetPath;
}

// ============================================================================
// Safe Basename (for logging)
// ============================================================================

/**
 * Get safe basename for logging (no path info leak)
 */
export function safeBasename(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Sanitize path for safe logging (removes sensitive parent directories)
 */
export function sanitizePathForLog(filePath: string, jobId: string): string {
  // Show only: jobs/{jobId}/{filename}
  const basename = path.basename(filePath);
  return `jobs/${jobId}/${basename}`;
}
