/**
 * downloadBytesAsFile.ts - Browser File Download Helper
 *
 * Downloads bytes as a file in the browser.
 * Creates a temporary Blob URL and triggers download.
 */

export interface DownloadBytesArgs {
  /** Binary content */
  bytes: Uint8Array;

  /** MIME type */
  mime: string;

  /** Filename for download */
  filename: string;
}

/**
 * Download bytes as a file in the browser
 *
 * Creates a temporary blob URL, triggers download via anchor click,
 * then revokes the URL to prevent memory leaks.
 */
export function downloadBytesAsFile(args: DownloadBytesArgs): void {
  const { bytes, mime, filename } = args;

  // Create a new Uint8Array copy to ensure ArrayBuffer compatibility
  const bytesCopy = new Uint8Array(bytes);
  const blob = new Blob([bytesCopy], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Revoke URL after a delay to avoid memory leak
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Download text as a file
 */
export function downloadTextAsFile(args: {
  text: string;
  filename: string;
  mime?: string;
}): void {
  const bytes = new TextEncoder().encode(args.text);
  downloadBytesAsFile({
    bytes,
    mime: args.mime ?? 'text/plain',
    filename: args.filename,
  });
}

/**
 * Download JSON as a file
 */
export function downloadJsonAsFile(args: {
  data: unknown;
  filename: string;
  pretty?: boolean;
}): void {
  const text = args.pretty
    ? JSON.stringify(args.data, null, 2)
    : JSON.stringify(args.data);

  downloadTextAsFile({
    text,
    filename: args.filename,
    mime: 'application/json',
  });
}
