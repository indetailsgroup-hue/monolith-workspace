// SHA-256 via WebCrypto (browser + Node ≥18) — lowercase hex per §7.6.
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Id(bytes: Uint8Array): Promise<string> {
  return 'sha256:' + (await sha256Hex(bytes));
}
