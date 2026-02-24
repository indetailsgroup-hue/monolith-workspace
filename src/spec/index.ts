/**
 * MONOLITH Spec Module
 *
 * Factory Workflow: Freeze = Snapshot, Gate = Explicit Step, Release = Signed Package
 */

// Types
export type {
  SpecState,
  Severity,
  DraftSpec,
  DraftSummary,
  SnapshotPayload,
  FrozenSnapshot,
  GateIssue,
  GateReport,
  SignedManifest,
  ApprovalSignature,
  ReleasePackage,
  DraftDoc,
  FrozenDoc,
  ReleasedDoc,
  SpecDoc,
  MachineProfile,
} from './types';

// Services
export type {
  FreezeInput,
  GateRunInput,
  ReleaseInput,
  CreateRevisionInput,
  SpecServices,
} from './services';

export {
  createMockSpecServices,
  makeMockBreakdownRows,
  createInitialDraftDoc,
} from './services';

// Store
export type { SpecStoreState } from './store';
export { createSpecStore, canEdit, canRunGate, canRelease, canExport } from './store';

// Provider & Hooks
export {
  SpecStoreProvider,
  useSpecStore,
  useSpecDoc,
  useSpecState,
  useSpecModals,
  useGateUi,
  useAsyncState,
  useSpecStoreApi,
  useDraftManufacturing,
  useDraftManufacturingActions,
} from './SpecStoreProvider';

// UI Components
export {
  SpecStateBanner,
  FreezeModal,
  GatePanel,
  ReleaseWizardModal,
  ReleaseCenter,
  DesignerScreen,
} from './ui';

// B4: Preflight Engine
export {
  runPreflight,
  formatPreflightSummary,
  getPreflightBlockers,
  getPreflightWarnings,
} from './runPreflight';
export type {
  PreflightCheckId,
  PreflightSeverity,
  PreflightCheck,
  PreflightResult,
  PreflightOptions,
} from './runPreflight';
