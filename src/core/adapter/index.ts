/**
 * Adapter Module Index
 *
 * Adapters bridging UI and service layers.
 */

// Spec State Adapter
export type {
  UISnapshot,
  CommitSpecStateFn,
  SpecActionAdapters,
} from './commitSpecStateAdapter';

export {
  makeCommitSpecStateAdapter,
  makeFreezeAdapter,
  makeReleaseAdapter,
  makeUnfreezeAdapter,
  makeSpecActionAdapters,
} from './commitSpecStateAdapter';

// Download Helpers
export {
  downloadZipBundle,
  downloadZipBundleBytes,
  generateBundleFilename,
  readFileAsBlob,
  readFileAsBytes,
  selectFile,
  selectAndReadZipFile,
} from './downloadZipBundle';
