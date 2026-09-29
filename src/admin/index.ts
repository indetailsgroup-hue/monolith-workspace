export { SuperAdminDashboard } from './SuperAdminDashboard';
export { PlatformSearchPanel } from './PlatformSearchPanel';
export { SearchAnalyticsDashboard } from './SearchAnalyticsDashboard';
export { platformSearch, searchJobs, searchMembers, searchInvoices, createDebouncedSearch } from './platformSearch';
export { fetchSearchAnalytics, logSearch, logSearchClick } from './searchAnalytics';
export type {
  SearchResult,
  SearchEntityType,
  PlatformSearchOptions,
  PlatformSearchResponse,
} from './platformSearch';
export type { SearchAnalyticsData, SearchLogEntry } from './searchAnalytics';

// v16.7.0 — Autocomplete, Bookmarks, CSV Export
export { fetchAutocompleteSuggestions, getRecentSearches, addRecentSearch, clearRecentSearches, getCombinedSuggestions } from './searchAutocomplete';
export { fetchBookmarks, createBookmark, deleteBookmark, incrementBookmarkUse, updateBookmarkLabel } from './searchBookmarks';
export { downloadSearchAnalyticsCsv, buildSearchAnalyticsCsv } from './csvExport';
export { AutocompleteDropdown } from './AutocompleteDropdown';
export { BookmarkPanel } from './BookmarkPanel';
export type { AutocompleteSuggestion, CombinedSuggestions } from './searchAutocomplete';
export type { SearchBookmark, CreateBookmarkParams } from './searchBookmarks';
export type { SearchAnalyticsExportData } from './csvExport';

// v16.8.0 — Super-admin-guarded panel exports
export { default as withSuperAdminGuard, SuperAdminDenied } from './withSuperAdminGuard';
export { GuardedPlatformSearchPanel } from './PlatformSearchPanel';
export { GuardedSearchAnalyticsDashboard } from './SearchAnalyticsDashboard';
