/**
 * index.ts - Tool Wear & Cost Intelligence Module
 *
 * D6 module for tracking tool usage and estimating wear/cost.
 * Observer pattern - reads but never writes to G-code path.
 *
 * @version 1.5.0 - Phase D6 Complete (D6-A through D6-E.2)
 */

// D6-A: Types
export * from './types';
export * from './wearModel';

// D6-B: Observer
export * from './observerTypes';
export * from './toolUsageObserver';
export * from './toolUsageObserverHelpers';

// D6-C: Storage
export * from './storage';

// D6-D: Wiring
export * from './wireToolUsage';

// D6-E.1: Query Helpers
export * from './query';
