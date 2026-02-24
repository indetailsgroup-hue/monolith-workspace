/**
 * Bootstrap Module Index
 *
 * Application initialization and wiring
 */

export type {
  TrustChainConfig,
  TrustChainContext,
  SigningKeys,
  GuardedExportArgs,
  CommitArgs,
  GenesisArgs,
} from './bootstrapTrustChain';

export {
  bootstrapTrustChain,
  getTrustChain,
  resetTrustChain,
  generateDevSigningKeys,
  bootstrapDevTrustChain,
} from './bootstrapTrustChain';
