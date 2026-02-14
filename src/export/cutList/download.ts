/**
 * File Download Utility
 *
 * Browser-based file download via Blob + anchor click.
 */

/**
 * Download text content as a file.
 *
 * @param filename - Name for the downloaded file
 * @param content - Text content to download
 * @param mime - MIME type (default: text/plain)
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime: string = 'text/plain;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
