// src/factory/api/index.ts
/**
 * Factory API exports
 */

// API client
export { apiFetch, apiFetchBlob } from './client';
export type { ApiError } from './client';

// Jobs API
export { fetchJobsApi, fetchJobDetailApi, triggerLegacyExportApi } from './jobsApi';
export type { LegacyExportRequest } from './jobsApi';

// Export API
export {
  fetchExportOptionsApi,
  runGatedExportApi,
  downloadExportApi,
  triggerBrowserDownload,
  getFilenameFromHeaders,
} from './exportApi';

// Verify API
export { verifyJobApi } from './verifyApi';

// Activity API
export { fetchJobActivityApi } from './activityApi';

// Mock data (dev only - controlled by VITE_USE_FACTORY_MOCK flag)
export { enableMockApi, disableMockApi, shouldUseMockApi } from './mockData';
