/**
 * Verify Configuration - Environment & Path Configuration
 * PR-P1.1-B.3 Real Verifier Integration
 *
 * Security: All paths are pinned at startup, no runtime path injection allowed.
 *
 * @version 0.12.0
 */

import * as path from "path";
import * as fs from "fs";

// ============================================================================
// Configuration Interface
// ============================================================================

export interface VerifyConfig {
  /** Absolute path to monolith-verify binary */
  verifierBinPath: string;
  /** Absolute path to production keyset JSON */
  prodKeysPath: string;
  /** Timeout for verify process in milliseconds */
  timeoutMs: number;
  /** Maximum log bytes before truncation */
  maxLogBytes: number;
  /** Working directory for verifier (optional) */
  workdir?: string;
  /** Root directory for job storage (for path validation) */
  jobStorageRoot: string;
}

// ============================================================================
// Environment Variable Names
// ============================================================================

const ENV_KEYS = {
  VERIFIER_BIN_PATH: "MONOLITH_VERIFIER_BIN_PATH",
  PROD_KEYS_PATH: "MONOLITH_PROD_KEYS_PATH",
  VERIFY_TIMEOUT_MS: "MONOLITH_VERIFY_TIMEOUT_MS",
  MAX_LOG_BYTES: "MONOLITH_MAX_LOG_BYTES",
  VERIFIER_WORKDIR: "MONOLITH_VERIFIER_WORKDIR",
  JOB_STORAGE_ROOT: "MONOLITH_JOB_STORAGE_ROOT",
} as const;

// ============================================================================
// Default Values
// ============================================================================

const DEFAULTS = {
  TIMEOUT_MS: 25000,
  MAX_LOG_BYTES: 200_000,
} as const;

// ============================================================================
// Configuration Errors
// ============================================================================

export class VerifyConfigError extends Error {
  constructor(
    message: string,
    public readonly configKey: string
  ) {
    super(message);
    this.name = "VerifyConfigError";
  }
}

// ============================================================================
// Path Resolution & Validation
// ============================================================================

/**
 * Resolve path to absolute, handling relative paths from CWD
 */
function resolvePath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }
  return path.resolve(process.cwd(), inputPath);
}

/**
 * Validate that a file exists and is readable
 */
function validateFileReadable(filePath: string, configKey: string): void {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    throw new VerifyConfigError(
      `File not readable: ${filePath}`,
      configKey
    );
  }
}

/**
 * Validate that a directory exists
 */
function validateDirectoryExists(dirPath: string, configKey: string): void {
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new VerifyConfigError(
        `Path is not a directory: ${dirPath}`,
        configKey
      );
    }
  } catch (err) {
    if (err instanceof VerifyConfigError) throw err;
    throw new VerifyConfigError(
      `Directory not accessible: ${dirPath}`,
      configKey
    );
  }
}

// ============================================================================
// Configuration Loader
// ============================================================================

let cachedConfig: VerifyConfig | null = null;

/**
 * Load and validate verify configuration from environment.
 * Throws VerifyConfigError if required config is missing or invalid.
 *
 * Configuration is cached after first load.
 */
export function loadVerifyConfig(forceReload = false): VerifyConfig {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  const env = process.env;

  // Required: Verifier binary path
  const verifierBinRaw = env[ENV_KEYS.VERIFIER_BIN_PATH];
  if (!verifierBinRaw) {
    throw new VerifyConfigError(
      `Missing required environment variable: ${ENV_KEYS.VERIFIER_BIN_PATH}`,
      ENV_KEYS.VERIFIER_BIN_PATH
    );
  }
  const verifierBinPath = resolvePath(verifierBinRaw);
  validateFileReadable(verifierBinPath, ENV_KEYS.VERIFIER_BIN_PATH);

  // Required: Production keys path
  const prodKeysRaw = env[ENV_KEYS.PROD_KEYS_PATH];
  if (!prodKeysRaw) {
    throw new VerifyConfigError(
      `Missing required environment variable: ${ENV_KEYS.PROD_KEYS_PATH}`,
      ENV_KEYS.PROD_KEYS_PATH
    );
  }
  const prodKeysPath = resolvePath(prodKeysRaw);
  validateFileReadable(prodKeysPath, ENV_KEYS.PROD_KEYS_PATH);

  // Required: Job storage root
  const jobStorageRaw = env[ENV_KEYS.JOB_STORAGE_ROOT];
  if (!jobStorageRaw) {
    throw new VerifyConfigError(
      `Missing required environment variable: ${ENV_KEYS.JOB_STORAGE_ROOT}`,
      ENV_KEYS.JOB_STORAGE_ROOT
    );
  }
  const jobStorageRoot = resolvePath(jobStorageRaw);
  validateDirectoryExists(jobStorageRoot, ENV_KEYS.JOB_STORAGE_ROOT);

  // Optional: Timeout
  const timeoutRaw = env[ENV_KEYS.VERIFY_TIMEOUT_MS];
  const timeoutMs = timeoutRaw ? parseInt(timeoutRaw, 10) : DEFAULTS.TIMEOUT_MS;
  if (isNaN(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
    throw new VerifyConfigError(
      `Invalid timeout value: ${timeoutRaw} (must be 1000-300000ms)`,
      ENV_KEYS.VERIFY_TIMEOUT_MS
    );
  }

  // Optional: Max log bytes
  const maxLogRaw = env[ENV_KEYS.MAX_LOG_BYTES];
  const maxLogBytes = maxLogRaw ? parseInt(maxLogRaw, 10) : DEFAULTS.MAX_LOG_BYTES;
  if (isNaN(maxLogBytes) || maxLogBytes < 1000 || maxLogBytes > 10_000_000) {
    throw new VerifyConfigError(
      `Invalid max log bytes: ${maxLogRaw} (must be 1000-10000000)`,
      ENV_KEYS.MAX_LOG_BYTES
    );
  }

  // Optional: Working directory
  const workdirRaw = env[ENV_KEYS.VERIFIER_WORKDIR];
  let workdir: string | undefined;
  if (workdirRaw) {
    workdir = resolvePath(workdirRaw);
    validateDirectoryExists(workdir, ENV_KEYS.VERIFIER_WORKDIR);
  }

  cachedConfig = {
    verifierBinPath,
    prodKeysPath,
    timeoutMs,
    maxLogBytes,
    workdir,
    jobStorageRoot,
  };

  return cachedConfig;
}

/**
 * Get current config (throws if not loaded)
 */
export function getVerifyConfig(): VerifyConfig {
  if (!cachedConfig) {
    return loadVerifyConfig();
  }
  return cachedConfig;
}

/**
 * Clear cached config (for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

// ============================================================================
// Development/Test Mode Support
// ============================================================================

/**
 * Check if running in development/mock mode
 */
export function isVerifyMockMode(): boolean {
  return process.env.MONOLITH_VERIFY_MOCK === "true";
}

/**
 * Create a mock config for development (does not validate files)
 */
export function createMockConfig(overrides: Partial<VerifyConfig> = {}): VerifyConfig {
  return {
    verifierBinPath: overrides.verifierBinPath ?? "/mock/monolith-verify",
    prodKeysPath: overrides.prodKeysPath ?? "/mock/production.pubkeys.v1.json",
    timeoutMs: overrides.timeoutMs ?? DEFAULTS.TIMEOUT_MS,
    maxLogBytes: overrides.maxLogBytes ?? DEFAULTS.MAX_LOG_BYTES,
    workdir: overrides.workdir,
    jobStorageRoot: overrides.jobStorageRoot ?? "/mock/jobs",
  };
}
