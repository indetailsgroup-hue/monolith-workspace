/**
 * Factory Store - Zustand state management for Factory Ops UI
 * P1.1 Factory Ops UX
 * P7A: Activity / Audit Timeline
 *
 * @version 0.12.7
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  JobSummary,
  JobDetailData,
  JobStatus,
  MachineType,
  VerifyApiResponse,
  ExportResponse,
  ActivityLogEntry,
} from "../types/job";
import type {
  PacketResponse,
  PacketResponseError,
  PacketCacheEntry,
  PacketFetchStatus,
} from "../components/packet/packetTypes";
import { isPacketSuccess } from "../components/packet/packetTypes";
import type {
  ExportRequest as GatedExportRequest,
  ExportResponse as GatedExportResponse,
  ExportResponseSuccess as GatedExportResponseSuccess,
  ExportResponseError as GatedExportResponseError,
  ExportOptionsResponse,
  ExportCacheEntry,
  ExportStatus,
  ExportDialect,
  ExportProfileId,
} from "../components/export/exportTypes";
import { isExportSuccess } from "../components/export/exportTypes";
import { normalizeError } from "../utils/verifyNormalizer";
import {
  fetchExportOptionsApi,
  runGatedExportApi,
} from "../api/exportApi";
import type {
  ActivityRecord,
  ActivityCacheEntry,
  ActivityFetchStatus,
} from "../types/activity";
import { fetchJobActivityApi } from "../api/activityApi";

// ============================================================================
// Filter & Sort
// ============================================================================

export type JobFilter = "ALL" | JobStatus;
export type JobSort = "updatedAt" | "createdAt" | "jobId" | "projectName";
export type SortDirection = "asc" | "desc";

// Dashboard-specific sort (C.2)
export type DashboardSort = "UPDATED_DESC" | "UPDATED_ASC";

// Job grouping categories (C.2)
export type JobGroup = "incoming" | "blocked" | "history";

export interface GroupedJobs {
  incoming: JobSummary[];
  blocked: JobSummary[];
  history: JobSummary[];
}

// ============================================================================
// Per-Job Verify State
// ============================================================================

export type VerifyStatus = "IDLE" | "RUNNING" | "DONE";

export interface JobVerifyState {
  status: VerifyStatus;
  response: VerifyApiResponse | null;
  lastRunAt: string | null;
  retryCount: number;
}

// ============================================================================
// Store State
// ============================================================================

interface FactoryState {
  // Job list
  jobs: JobSummary[];
  jobsLoading: boolean;
  jobsError: string | null;

  // Selected job
  selectedJobId: string | null;
  selectedJob: JobDetailData | null;
  selectedJobLoading: boolean;

  // Filter & Sort
  filter: JobFilter;
  sort: JobSort;
  sortDirection: SortDirection;
  searchQuery: string;

  // Dashboard UI State (C.2)
  dashboardQuery: string;
  dashboardStatusFilters: JobStatus[];  // empty = ALL
  dashboardSort: DashboardSort;

  // Verification (global - backward compat)
  verifying: boolean;
  verifyResult: VerifyApiResponse | null;

  // Per-job verification state
  verifyByJobId: Record<string, JobVerifyState>;

  // Packet cache (P2.1)
  packetByJobId: Record<string, PacketCacheEntry>;

  // Export (legacy)
  exporting: boolean;
  exportResult: ExportResponse | null;
  selectedMachine: MachineType | null;

  // Gated Export (P2.2)
  gatedExportByJobId: Record<string, ExportCacheEntry>;
  exportOptions: ExportOptionsResponse | null;
  exportOptionsLoading: boolean;

  // Activity log (legacy client-side)
  activityLog: ActivityLogEntry[];

  // Server-authoritative Activity Timeline (P7A)
  serverActivityByJobId: Record<string, ActivityCacheEntry>;

  // Incident banner
  incidentActive: boolean;
  incidentMessage: string | null;
}

// ============================================================================
// Store Actions
// ============================================================================

interface FactoryActions {
  // Job list
  setJobs: (jobs: JobSummary[]) => void;
  setJobsLoading: (loading: boolean) => void;
  setJobsError: (error: string | null) => void;
  refreshJobs: () => Promise<void>;

  // Selected job
  selectJob: (jobId: string | null) => void;
  setSelectedJob: (job: JobDetailData | null) => void;
  setSelectedJobLoading: (loading: boolean) => void;
  loadJobDetailData: (jobId: string) => Promise<void>;

  // Filter & Sort
  setFilter: (filter: JobFilter) => void;
  setSort: (sort: JobSort) => void;
  setSortDirection: (direction: SortDirection) => void;
  setSearchQuery: (query: string) => void;

  // Dashboard UI Actions (C.2)
  setDashboardQuery: (query: string) => void;
  setDashboardStatusFilters: (filters: JobStatus[]) => void;
  toggleDashboardStatusFilter: (status: JobStatus) => void;
  clearDashboardStatusFilters: () => void;
  setDashboardSort: (sort: DashboardSort) => void;

  // Verification (global - backward compat)
  startVerify: (jobId: string) => Promise<VerifyApiResponse>;
  setVerifying: (verifying: boolean) => void;
  setVerifyResult: (result: VerifyApiResponse | null) => void;
  clearVerifyResult: () => void;

  // Per-job verification
  getJobVerifyState: (jobId: string) => JobVerifyState;
  setJobVerifyStatus: (jobId: string, status: VerifyStatus) => void;
  setJobVerifyResponse: (jobId: string, response: VerifyApiResponse) => void;
  clearJobVerifyState: (jobId: string) => void;

  // Packet cache (P2.1)
  getPacketCacheEntry: (jobId: string) => PacketCacheEntry;
  fetchPacket: (jobId: string) => Promise<PacketResponse>;
  clearPacketCache: (jobId: string) => void;
  clearAllPacketCache: () => void;

  // Export (legacy)
  startExport: (
    jobId: string,
    machine: MachineType
  ) => Promise<ExportResponse>;
  setExporting: (exporting: boolean) => void;
  setExportResult: (result: ExportResponse | null) => void;
  setSelectedMachine: (machine: MachineType | null) => void;
  clearExportResult: () => void;

  // Gated Export (P2.2)
  getExportCacheEntry: (jobId: string) => ExportCacheEntry;
  fetchExportOptions: () => Promise<ExportOptionsResponse | null>;
  runGatedExport: (
    jobId: string,
    request: GatedExportRequest
  ) => Promise<GatedExportResponse>;
  clearGatedExportCache: (jobId: string) => void;
  clearAllGatedExportCache: () => void;

  // Activity log (legacy client-side)
  addActivity: (entry: Omit<ActivityLogEntry, "id">) => void;
  clearActivityLog: () => void;

  // Server-authoritative Activity Timeline (P7A)
  getServerActivityCacheEntry: (jobId: string) => ActivityCacheEntry;
  fetchServerActivity: (jobId: string) => Promise<ActivityRecord[]>;
  clearServerActivityCache: (jobId: string) => void;

  // Incident
  setIncident: (active: boolean, message?: string) => void;

  // Computed getters
  getFilteredJobs: () => JobSummary[];
  getJobCounts: () => Record<JobStatus | "ALL", number>;

  // Dashboard computed getters (C.2)
  getDashboardFilteredJobs: () => JobSummary[];
  getDashboardGroupedJobs: () => GroupedJobs;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: FactoryState = {
  jobs: [],
  jobsLoading: false,
  jobsError: null,

  selectedJobId: null,
  selectedJob: null,
  selectedJobLoading: false,

  filter: "ALL",
  sort: "updatedAt",
  sortDirection: "desc",
  searchQuery: "",

  // Dashboard UI State (C.2)
  dashboardQuery: "",
  dashboardStatusFilters: [],
  dashboardSort: "UPDATED_DESC",

  verifying: false,
  verifyResult: null,
  verifyByJobId: {},

  // Packet cache (P2.1)
  packetByJobId: {},

  exporting: false,
  exportResult: null,
  selectedMachine: null,

  // Gated Export (P2.2)
  gatedExportByJobId: {},
  exportOptions: null,
  exportOptionsLoading: false,

  activityLog: [],

  // Server-authoritative Activity Timeline (P7A)
  serverActivityByJobId: {},

  incidentActive: false,
  incidentMessage: null,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useFactoryStore = create<FactoryState & FactoryActions>()(
  immer((set, get) => ({
    ...initialState,

    // ========================================================================
    // Job List Actions
    // ========================================================================

    setJobs: (jobs) =>
      set((state) => {
        state.jobs = jobs;
      }),

    setJobsLoading: (loading) =>
      set((state) => {
        state.jobsLoading = loading;
      }),

    setJobsError: (error) =>
      set((state) => {
        state.jobsError = error;
      }),

    refreshJobs: async () => {
      const { setJobsLoading, setJobs, setJobsError } = get();
      setJobsLoading(true);
      setJobsError(null);

      try {
        // TODO: Replace with actual API call
        const response = await fetch("/api/factory/jobs");
        if (!response.ok) throw new Error("Failed to fetch jobs");
        const jobs = await response.json();
        setJobs(jobs);
      } catch (error) {
        setJobsError(
          error instanceof Error ? error.message : "Unknown error"
        );
      } finally {
        setJobsLoading(false);
      }
    },

    // ========================================================================
    // Selected Job Actions
    // ========================================================================

    selectJob: (jobId) =>
      set((state) => {
        state.selectedJobId = jobId;
        if (!jobId) {
          state.selectedJob = null;
        }
      }),

    setSelectedJob: (job) =>
      set((state) => {
        state.selectedJob = job;
      }),

    setSelectedJobLoading: (loading) =>
      set((state) => {
        state.selectedJobLoading = loading;
      }),

    loadJobDetailData: async (jobId) => {
      const { setSelectedJobLoading, setSelectedJob, selectJob } = get();
      selectJob(jobId);
      setSelectedJobLoading(true);

      try {
        // TODO: Replace with actual API call
        const response = await fetch(`/api/factory/jobs/${jobId}`);
        if (!response.ok) throw new Error("Failed to fetch job detail");
        const job = await response.json();
        setSelectedJob(job);
      } catch (error) {
        console.error("Failed to load job:", error);
        setSelectedJob(null);
      } finally {
        setSelectedJobLoading(false);
      }
    },

    // ========================================================================
    // Filter & Sort Actions
    // ========================================================================

    setFilter: (filter) =>
      set((state) => {
        state.filter = filter;
      }),

    setSort: (sort) =>
      set((state) => {
        state.sort = sort;
      }),

    setSortDirection: (direction) =>
      set((state) => {
        state.sortDirection = direction;
      }),

    setSearchQuery: (query) =>
      set((state) => {
        state.searchQuery = query;
      }),

    // ========================================================================
    // Dashboard UI Actions (C.2)
    // ========================================================================

    setDashboardQuery: (query) =>
      set((state) => {
        state.dashboardQuery = query;
      }),

    setDashboardStatusFilters: (filters) =>
      set((state) => {
        state.dashboardStatusFilters = filters;
      }),

    toggleDashboardStatusFilter: (status) =>
      set((state) => {
        const idx = state.dashboardStatusFilters.indexOf(status);
        if (idx >= 0) {
          state.dashboardStatusFilters.splice(idx, 1);
        } else {
          state.dashboardStatusFilters.push(status);
        }
      }),

    clearDashboardStatusFilters: () =>
      set((state) => {
        state.dashboardStatusFilters = [];
      }),

    setDashboardSort: (sort) =>
      set((state) => {
        state.dashboardSort = sort;
      }),

    // ========================================================================
    // Verification Actions
    // ========================================================================

    startVerify: async (jobId) => {
      const { setVerifying, setVerifyResult, addActivity, refreshJobs } =
        get();
      setVerifying(true);
      setVerifyResult(null);

      addActivity({
        jobId,
        type: "VERIFY_STARTED",
        actor: "factory-operator",
        timestamp: new Date().toISOString(),
      });

      try {
        // Call verify API endpoint
        const response = await fetch(`/api/factory/jobs/${jobId}/verify`, {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(`Verification failed: ${response.status}`);
        }

        // API returns VerifyApiResponse directly (already normalized on server)
        const result: VerifyApiResponse = await response.json();

        setVerifyResult(result);

        // Log activity based on verdict
        const isPassed = result.verdict === "PASS" || result.verdict === "PASS_WITH_WARN";
        addActivity({
          jobId,
          type: isPassed ? "VERIFY_PASSED" : "VERIFY_FAILED",
          actor: "factory-operator",
          timestamp: new Date().toISOString(),
          details: { code: result.code, log: result.log },
        });

        // Refresh job list to update status
        await refreshJobs();

        return result;
      } catch (error) {
        // Use normalizer to convert error to proper VerifyApiResponse
        const errorResult = normalizeError(
          error instanceof Error ? error : new Error("Unknown error")
        );
        setVerifyResult(errorResult);
        throw error;
      } finally {
        setVerifying(false);
      }
    },

    setVerifying: (verifying) =>
      set((state) => {
        state.verifying = verifying;
      }),

    setVerifyResult: (result) =>
      set((state) => {
        state.verifyResult = result;
      }),

    clearVerifyResult: () =>
      set((state) => {
        state.verifyResult = null;
      }),

    // Per-job verification state management
    getJobVerifyState: (jobId) => {
      const state = get();
      return (
        state.verifyByJobId[jobId] || {
          status: "IDLE",
          response: null,
          lastRunAt: null,
          retryCount: 0,
        }
      );
    },

    setJobVerifyStatus: (jobId, status) =>
      set((state) => {
        if (!state.verifyByJobId[jobId]) {
          state.verifyByJobId[jobId] = {
            status: "IDLE",
            response: null,
            lastRunAt: null,
            retryCount: 0,
          };
        }
        state.verifyByJobId[jobId].status = status;
        if (status === "RUNNING") {
          state.verifyByJobId[jobId].lastRunAt = new Date().toISOString();
        }
      }),

    setJobVerifyResponse: (jobId, response) =>
      set((state) => {
        if (!state.verifyByJobId[jobId]) {
          state.verifyByJobId[jobId] = {
            status: "IDLE",
            response: null,
            lastRunAt: null,
            retryCount: 0,
          };
        }
        state.verifyByJobId[jobId].status = "DONE";
        state.verifyByJobId[jobId].response = response;
      }),

    clearJobVerifyState: (jobId) =>
      set((state) => {
        delete state.verifyByJobId[jobId];
      }),

    // ========================================================================
    // Packet Cache Actions (P2.1)
    // ========================================================================

    getPacketCacheEntry: (jobId) => {
      const state = get();
      return (
        state.packetByJobId[jobId] || {
          status: "IDLE" as PacketFetchStatus,
          data: undefined,
          error: undefined,
          fetchedAt: undefined,
        }
      );
    },

    fetchPacket: async (jobId) => {
      // Check if already loading
      const currentEntry = get().packetByJobId[jobId];
      if (currentEntry?.status === "LOADING") {
        // Return cached promise or wait
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            const entry = get().packetByJobId[jobId];
            if (entry?.status !== "LOADING") {
              clearInterval(checkInterval);
              if (entry?.data) {
                resolve(entry.data);
              } else if (entry?.error) {
                resolve(entry.error);
              } else {
                resolve({ ok: false, code: "E_PACKET_FETCH", message: "Unknown error" });
              }
            }
          }, 100);
        });
      }

      // Set loading state
      set((state) => {
        state.packetByJobId[jobId] = {
          status: "LOADING",
          data: undefined,
          error: undefined,
          fetchedAt: undefined,
        };
      });

      try {
        const response = await fetch(`/api/factory/jobs/${jobId}/packet`);
        const result: PacketResponse = await response.json();

        set((state) => {
          if (isPacketSuccess(result)) {
            state.packetByJobId[jobId] = {
              status: "DONE",
              data: result,
              error: undefined,
              fetchedAt: new Date().toISOString(),
            };
          } else {
            state.packetByJobId[jobId] = {
              status: "ERROR",
              data: undefined,
              error: result as PacketResponseError,
              fetchedAt: new Date().toISOString(),
            };
          }
        });

        return result;
      } catch (error) {
        const errorResponse: PacketResponseError = {
          ok: false,
          code: "E_PACKET_FETCH",
          message: error instanceof Error ? error.message : "Failed to fetch packet",
        };

        set((state) => {
          state.packetByJobId[jobId] = {
            status: "ERROR",
            data: undefined,
            error: errorResponse,
            fetchedAt: new Date().toISOString(),
          };
        });

        return errorResponse;
      }
    },

    clearPacketCache: (jobId) =>
      set((state) => {
        delete state.packetByJobId[jobId];
      }),

    clearAllPacketCache: () =>
      set((state) => {
        state.packetByJobId = {};
      }),

    // ========================================================================
    // Export Actions
    // ========================================================================

    startExport: async (jobId, machine) => {
      const { setExporting, setExportResult, addActivity, refreshJobs } =
        get();
      setExporting(true);
      setExportResult(null);

      addActivity({
        jobId,
        type: "EXPORT_STARTED",
        actor: "factory-operator",
        timestamp: new Date().toISOString(),
        details: { machine },
      });

      try {
        // TODO: Replace with actual API call
        const response = await fetch(`/api/factory/jobs/${jobId}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ machine, format: "per_job" }),
        });
        if (!response.ok) throw new Error("Export failed");
        const result: ExportResponse = await response.json();

        setExportResult(result);

        addActivity({
          jobId,
          type: "EXPORT_COMPLETED",
          actor: "factory-operator",
          timestamp: new Date().toISOString(),
          details: { machine, filename: result.filename },
        });

        // Refresh job list to update status
        await refreshJobs();

        return result;
      } finally {
        setExporting(false);
      }
    },

    setExporting: (exporting) =>
      set((state) => {
        state.exporting = exporting;
      }),

    setExportResult: (result) =>
      set((state) => {
        state.exportResult = result;
      }),

    setSelectedMachine: (machine) =>
      set((state) => {
        state.selectedMachine = machine;
      }),

    clearExportResult: () =>
      set((state) => {
        state.exportResult = null;
      }),

    // ========================================================================
    // Gated Export Actions (P2.2)
    // ========================================================================

    getExportCacheEntry: (jobId) => {
      const state = get();
      return (
        state.gatedExportByJobId[jobId] || {
          status: "IDLE" as ExportStatus,
          options: undefined,
          lastExport: undefined,
          error: undefined,
          fetchedAt: undefined,
        }
      );
    },

    fetchExportOptions: async () => {
      // Check if already loaded
      if (get().exportOptions) {
        return get().exportOptions;
      }

      set((state) => {
        state.exportOptionsLoading = true;
      });

      try {
        // Use real API client
        const { data } = await fetchExportOptionsApi();

        set((state) => {
          state.exportOptions = data;
          state.exportOptionsLoading = false;
        });

        return data;
      } catch (error) {
        console.error("Failed to fetch export options:", error);
        set((state) => {
          state.exportOptionsLoading = false;
        });
        return null;
      }
    },

    runGatedExport: async (jobId, request) => {
      const { addActivity } = get();

      // Set loading state for this job
      set((state) => {
        state.gatedExportByJobId[jobId] = {
          ...state.gatedExportByJobId[jobId],
          status: "EXPORTING",
          error: undefined,
        };
      });

      addActivity({
        jobId,
        type: "EXPORT_STARTED",
        actor: "factory-operator",
        timestamp: new Date().toISOString(),
        details: { dialect: request.dialect, profileId: request.profileId },
      });

      try {
        // Use real API client with SHA256 header capture
        const { response: result, sha256 } = await runGatedExportApi(jobId, request);

        if (isExportSuccess(result)) {
          // Merge authoritative sha256 from header (overrides body if present)
          const exportWithSha256 = {
            ...result,
            sha256: sha256 ?? result.sha256,
          };

          set((state) => {
            state.gatedExportByJobId[jobId] = {
              status: "DONE",
              lastExport: exportWithSha256,
              error: undefined,
              fetchedAt: new Date().toISOString(),
            };
          });

          addActivity({
            jobId,
            type: "EXPORT_COMPLETED",
            actor: "factory-operator",
            timestamp: new Date().toISOString(),
            details: {
              exportId: result.exportId,
              dialect: result.dialect,
              sha256: sha256 ?? result.sha256,
              filename: result.filename,
            },
          });
        } else {
          set((state) => {
            state.gatedExportByJobId[jobId] = {
              status: "ERROR",
              lastExport: undefined,
              error: result,
              fetchedAt: new Date().toISOString(),
            };
          });

          addActivity({
            jobId,
            type: "EXPORT_STARTED", // Using EXPORT_STARTED with error details
            actor: "factory-operator",
            timestamp: new Date().toISOString(),
            details: { error: result.code, message: result.message },
          });
        }

        return result;
      } catch (error) {
        const errorResponse: GatedExportResponseError = {
          ok: false,
          code: "E_EXPORT_INTERNAL",
          message: error instanceof Error ? error.message : "Export failed",
        };

        set((state) => {
          state.gatedExportByJobId[jobId] = {
            status: "ERROR",
            lastExport: undefined,
            error: errorResponse,
            fetchedAt: new Date().toISOString(),
          };
        });

        return errorResponse;
      }
    },

    clearGatedExportCache: (jobId) =>
      set((state) => {
        delete state.gatedExportByJobId[jobId];
      }),

    clearAllGatedExportCache: () =>
      set((state) => {
        state.gatedExportByJobId = {};
      }),

    // ========================================================================
    // Activity Log Actions
    // ========================================================================

    addActivity: (entry) =>
      set((state) => {
        state.activityLog.unshift({
          ...entry,
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });
        // Keep last 100 entries
        if (state.activityLog.length > 100) {
          state.activityLog = state.activityLog.slice(0, 100);
        }
      }),

    clearActivityLog: () =>
      set((state) => {
        state.activityLog = [];
      }),

    // ========================================================================
    // Server-authoritative Activity Timeline (P7A)
    // ========================================================================

    getServerActivityCacheEntry: (jobId) => {
      const state = get();
      return (
        state.serverActivityByJobId[jobId] || {
          status: "IDLE" as ActivityFetchStatus,
          items: [],
          error: undefined,
          fetchedAt: undefined,
        }
      );
    },

    fetchServerActivity: async (jobId) => {
      // Check if already loading
      const currentEntry = get().serverActivityByJobId[jobId];
      if (currentEntry?.status === "LOADING") {
        // Return cached items while loading
        return currentEntry.items;
      }

      // Set loading state
      set((state) => {
        state.serverActivityByJobId[jobId] = {
          status: "LOADING",
          items: state.serverActivityByJobId[jobId]?.items || [],
          error: undefined,
          fetchedAt: undefined,
        };
      });

      try {
        const response = await fetchJobActivityApi(jobId);

        set((state) => {
          state.serverActivityByJobId[jobId] = {
            status: "DONE",
            items: response.items,
            error: undefined,
            fetchedAt: response.fetchedAt,
          };
        });

        return response.items;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to fetch activity";

        set((state) => {
          state.serverActivityByJobId[jobId] = {
            status: "ERROR",
            items: [],
            error: errorMessage,
            fetchedAt: new Date().toISOString(),
          };
        });

        return [];
      }
    },

    clearServerActivityCache: (jobId) =>
      set((state) => {
        delete state.serverActivityByJobId[jobId];
      }),

    // ========================================================================
    // Incident Actions
    // ========================================================================

    setIncident: (active, message) =>
      set((state) => {
        state.incidentActive = active;
        state.incidentMessage = message || null;
      }),

    // ========================================================================
    // Computed Getters
    // ========================================================================

    getFilteredJobs: () => {
      const { jobs, filter, sort, sortDirection, searchQuery } = get();

      let filtered = [...jobs];

      // Apply status filter
      if (filter !== "ALL") {
        filtered = filtered.filter((job) => job.status === filter);
      }

      // Apply search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (job) =>
            job.jobId.toLowerCase().includes(query) ||
            job.projectName.toLowerCase().includes(query) ||
            job.customerName.toLowerCase().includes(query)
        );
      }

      // Apply sort
      filtered.sort((a, b) => {
        let comparison = 0;
        switch (sort) {
          case "updatedAt":
            comparison =
              new Date(a.updatedAt).getTime() -
              new Date(b.updatedAt).getTime();
            break;
          case "createdAt":
            comparison =
              new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime();
            break;
          case "jobId":
            comparison = a.jobId.localeCompare(b.jobId);
            break;
          case "projectName":
            comparison = a.projectName.localeCompare(b.projectName);
            break;
        }
        return sortDirection === "desc" ? -comparison : comparison;
      });

      return filtered;
    },

    getJobCounts: () => {
      const { jobs } = get();
      const counts: Record<JobStatus | "ALL", number> = {
        ALL: jobs.length,
        SIGNED: 0,
        VERIFIED: 0,
        BLOCKED: 0,
        IN_PRODUCTION: 0,
        ARCHIVED: 0,
      };

      for (const job of jobs) {
        counts[job.status]++;
      }

      return counts;
    },

    // ========================================================================
    // Dashboard Computed Getters (C.2)
    // ========================================================================

    getDashboardFilteredJobs: () => {
      const { jobs, dashboardQuery, dashboardStatusFilters, dashboardSort } = get();

      let filtered = [...jobs];

      // Apply status filter (empty = ALL)
      if (dashboardStatusFilters.length > 0) {
        filtered = filtered.filter((job) =>
          dashboardStatusFilters.includes(job.status)
        );
      }

      // Apply search (case-insensitive match on jobId or projectName)
      if (dashboardQuery.trim()) {
        const query = dashboardQuery.toLowerCase();
        filtered = filtered.filter(
          (job) =>
            job.jobId.toLowerCase().includes(query) ||
            job.projectName.toLowerCase().includes(query)
        );
      }

      // Apply sort
      filtered.sort((a, b) => {
        const timeA = new Date(a.updatedAt).getTime();
        const timeB = new Date(b.updatedAt).getTime();
        return dashboardSort === "UPDATED_DESC" ? timeB - timeA : timeA - timeB;
      });

      return filtered;
    },

    getDashboardGroupedJobs: () => {
      const filteredJobs = get().getDashboardFilteredJobs();

      const groups: GroupedJobs = {
        incoming: [],
        blocked: [],
        history: [],
      };

      for (const job of filteredJobs) {
        switch (job.status) {
          case "SIGNED":
            // Incoming: not yet verified
            groups.incoming.push(job);
            break;
          case "BLOCKED":
            // Blocked: gate fail or explicit block
            groups.blocked.push(job);
            break;
          case "VERIFIED":
          case "IN_PRODUCTION":
          case "ARCHIVED":
            // History: verified, in production, or archived
            groups.history.push(job);
            break;
        }
      }

      return groups;
    },
  }))
);

// ============================================================================
// Selectors (for performance optimization)
// ============================================================================

export const selectJobs = (state: FactoryState) => state.jobs;
export const selectSelectedJob = (state: FactoryState) => state.selectedJob;
export const selectVerifyResult = (state: FactoryState) => state.verifyResult;
export const selectVerifyByJobId = (state: FactoryState) => state.verifyByJobId;
export const selectPacketByJobId = (state: FactoryState) => state.packetByJobId;
export const selectIncident = (state: FactoryState) => ({
  active: state.incidentActive,
  message: state.incidentMessage,
});

/** Create a selector for a specific job's verify state */
export const createSelectJobVerifyState = (jobId: string) => (state: FactoryState): JobVerifyState =>
  state.verifyByJobId[jobId] || {
    status: "IDLE" as const,
    response: null,
    lastRunAt: null,
    retryCount: 0,
  };

/** Create a selector for a specific job's packet cache entry */
export const createSelectPacketCacheEntry = (jobId: string) => (state: FactoryState): PacketCacheEntry =>
  state.packetByJobId[jobId] || {
    status: "IDLE" as PacketFetchStatus,
    data: undefined,
    error: undefined,
    fetchedAt: undefined,
  };

// Gated Export Selectors (P2.2)
export const selectGatedExportByJobId = (state: FactoryState) => state.gatedExportByJobId;
export const selectExportOptions = (state: FactoryState) => state.exportOptions;
export const selectExportOptionsLoading = (state: FactoryState) => state.exportOptionsLoading;

/** Create a selector for a specific job's export cache entry */
export const createSelectExportCacheEntry = (jobId: string) => (state: FactoryState): ExportCacheEntry =>
  state.gatedExportByJobId[jobId] || {
    status: "IDLE" as ExportStatus,
    options: undefined,
    lastExport: undefined,
    error: undefined,
    fetchedAt: undefined,
  };
