/**
 * hashFile.ts - Node.js File Hashing Utility
 *
 * SHA-256 hash file using Node.js crypto module.
 * Used by CI verification scripts.
 */

import { createHash } from 'crypto';
import { createReadStream } from 'fs';

/**
 * Hash file using SHA-256 (streaming)
 *
 * @param filePath - Path to file
 * @returns SHA-256 hash as hex string
 */
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Hash string using SHA-256
 */
export function hashString(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Hash buffer using SHA-256
 */
export function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
