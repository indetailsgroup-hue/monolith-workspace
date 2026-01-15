/**
 * Global type declarations for IIMOS Server
 */

// JsonWebKey type (compatible with Node.js crypto module)
interface JsonWebKey {
  alg?: string;
  crv?: string;
  d?: string;
  dp?: string;
  dq?: string;
  e?: string;
  ext?: boolean;
  k?: string;
  key_ops?: string[];
  kty?: string;
  n?: string;
  oth?: RsaOtherPrimesInfo[];
  p?: string;
  q?: string;
  qi?: string;
  use?: string;
  x?: string;
  y?: string;
  // Index signature for Node.js crypto compatibility
  [key: string]: unknown;
}

interface RsaOtherPrimesInfo {
  d?: string;
  r?: string;
  t?: string;
}

// Module declarations for packages without types
declare module 'uuid' {
  export function v4(): string;
}
