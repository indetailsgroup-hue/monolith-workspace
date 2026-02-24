/**
 * DiagnosticsStore - Runtime Diagnostics & Smoke Tests
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Implements Annex B: Diagnostics & Smoke Tests
 * - WebGL context loss handling
 * - Performance monitoring (FPS, memory)
 * - Event logging for debugging
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ============================================
// TYPES
// ============================================

export type DiagnosticLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface DiagnosticEvent {
  timestamp: string;
  type: string;
  level: DiagnosticLevel;
  message: string;
  details?: Record<string, unknown>;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;          // ms
  textureMemMB: number;
  geometryCount: number;
  drawCalls: number;
  triangles: number;
}

export interface BrowserCapabilities {
  webgl2: boolean;
  ktx2: boolean;
  offscreenCanvas: boolean;
  sharedArrayBuffer: boolean;
}

export interface LoadMetrics {
  startTime: number;
  firstRenderTime?: number;
  fullLoadTime?: number;
  loadDurationMs?: number;
  status: 'PENDING' | 'OK' | 'SLOW' | 'FAILED';
}

export interface DiagnosticsState {
  // Performance
  performance: PerformanceMetrics;
  
  // Browser
  capabilities: BrowserCapabilities;
  
  // Load metrics
  load: LoadMetrics;
  
  // WebGL
  webglContextLost: boolean;
  webglRestoreAttempts: number;
  lastSnapshot?: string;  // Base64 image of last frame
  
  // Events
  events: DiagnosticEvent[];
  maxEvents: number;
  
  // Layout
  layoutOverlap: boolean;
  
  // Actions
  initDiagnostics: () => void;
  updatePerformance: (metrics: Partial<PerformanceMetrics>) => void;
  logEvent: (type: string, level: DiagnosticLevel, message: string, details?: Record<string, unknown>) => void;
  
  // Load tracking
  markFirstRender: () => void;
  markFullLoad: () => void;
  
  // WebGL
  onContextLost: () => void;
  onContextRestored: () => void;
  captureSnapshot: (imageData: string) => void;
  
  // Layout
  checkLayoutOverlap: () => boolean;
  
  // Clear
  clearEvents: () => void;
}

// ============================================
// HELPERS
// ============================================

function checkBrowserCapabilities(): BrowserCapabilities {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  
  return {
    webgl2: !!gl,
    ktx2: typeof window !== 'undefined' && 'KTX2Loader' in (window as any),
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  };
}

// ============================================
// STORE
// ============================================

export const useDiagnosticsStore = create<DiagnosticsState>()(
  immer((set, get) => ({
    // Initial state
    performance: {
      fps: 0,
      frameTime: 0,
      textureMemMB: 0,
      geometryCount: 0,
      drawCalls: 0,
      triangles: 0,
    },
    
    capabilities: {
      webgl2: false,
      ktx2: false,
      offscreenCanvas: false,
      sharedArrayBuffer: false,
    },
    
    load: {
      startTime: Date.now(),
      status: 'PENDING',
    },
    
    webglContextLost: false,
    webglRestoreAttempts: 0,
    
    events: [],
    maxEvents: 100,
    
    layoutOverlap: false,
    
    /**
     * Initialize diagnostics on workspace boot
     */
    initDiagnostics: () => {
      const capabilities = checkBrowserCapabilities();
      
      set((state) => {
        state.capabilities = capabilities;
        state.load.startTime = Date.now();
        state.load.status = 'PENDING';
      });
      
      // Log capabilities
      get().logEvent('diagnostics.init', 'INFO', 'Diagnostics initialized', { capabilities });
      
      // Warn about missing capabilities
      if (!capabilities.webgl2) {
        get().logEvent('diagnostics.capability', 'ERROR', 'WebGL2 not supported');
      }
      
      console.log('[Diagnostics] Initialized', capabilities);
    },
    
    /**
     * Update performance metrics (called from render loop)
     */
    updatePerformance: (metrics) => set((state) => {
      Object.assign(state.performance, metrics);
    }),
    
    /**
     * Log diagnostic event
     */
    logEvent: (type, level, message, details) => set((state) => {
      const event: DiagnosticEvent = {
        timestamp: new Date().toISOString(),
        type,
        level,
        message,
        details,
      };
      
      state.events.push(event);
      
      // Trim old events
      if (state.events.length > state.maxEvents) {
        state.events = state.events.slice(-state.maxEvents);
      }
      
      // Console output based on level
      switch (level) {
        case 'ERROR':
        case 'CRITICAL':
          console.error(`[${type}] ${message}`, details);
          break;
        case 'WARN':
          console.warn(`[${type}] ${message}`, details);
          break;
        default:
          console.log(`[${type}] ${message}`, details);
      }
    }),
    
    /**
     * Mark first render complete
     */
    markFirstRender: () => set((state) => {
      state.load.firstRenderTime = Date.now();
      const duration = state.load.firstRenderTime - state.load.startTime;
      
      get().logEvent('diagnostics.load', 'INFO', `First render: ${duration}ms`);
    }),
    
    /**
     * Mark full load complete
     */
    markFullLoad: () => set((state) => {
      state.load.fullLoadTime = Date.now();
      state.load.loadDurationMs = state.load.fullLoadTime - state.load.startTime;
      
      // Check against threshold (2500ms per spec)
      if (state.load.loadDurationMs <= 2500) {
        state.load.status = 'OK';
        get().logEvent('diagnostics.load', 'INFO', `Full load: ${state.load.loadDurationMs}ms (OK)`);
      } else {
        state.load.status = 'SLOW';
        get().logEvent('diagnostics.load', 'WARN', `Slow load: ${state.load.loadDurationMs}ms (> 2500ms)`);
      }
    }),
    
    /**
     * Handle WebGL context loss
     */
    onContextLost: () => set((state) => {
      state.webglContextLost = true;
      
      get().logEvent('webgl.contextLost', 'CRITICAL', 'WebGL context lost');
    }),
    
    /**
     * Handle WebGL context restore
     */
    onContextRestored: () => set((state) => {
      state.webglContextLost = false;
      state.webglRestoreAttempts += 1;
      
      get().logEvent('webgl.contextRestored', 'INFO', 'WebGL context restored', {
        attempts: state.webglRestoreAttempts,
      });
    }),
    
    /**
     * Capture last frame as snapshot (for context loss fallback)
     */
    captureSnapshot: (imageData) => set((state) => {
      state.lastSnapshot = imageData;
    }),
    
    /**
     * Check for layout overlaps
     */
    checkLayoutOverlap: () => {
      // Simple check: look for elements that might overlap
      // In real implementation, would check actual element positions
      const overlaps = false;
      
      set((state) => {
        state.layoutOverlap = overlaps;
      });
      
      if (overlaps) {
        get().logEvent('diagnostics.layout', 'WARN', 'Layout overlap detected');
      }
      
      return overlaps;
    },
    
    /**
     * Clear event log
     */
    clearEvents: () => set((state) => {
      state.events = [];
    }),
  }))
);

// ============================================
// HOOKS
// ============================================

import { useEffect, useRef } from 'react';

/**
 * Hook to track FPS
 */
export function useFPSMonitor() {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const updatePerformance = useDiagnosticsStore((s) => s.updatePerformance);
  
  useEffect(() => {
    let animationId: number;
    
    function measure() {
      frameCount.current++;
      const now = performance.now();
      const delta = now - lastTime.current;
      
      if (delta >= 1000) {
        const fps = Math.round((frameCount.current / delta) * 1000);
        const frameTime = delta / frameCount.current;
        
        updatePerformance({ fps, frameTime });
        
        frameCount.current = 0;
        lastTime.current = now;
      }
      
      animationId = requestAnimationFrame(measure);
    }
    
    animationId = requestAnimationFrame(measure);
    
    return () => cancelAnimationFrame(animationId);
  }, [updatePerformance]);
}

/**
 * Hook to setup WebGL context loss handlers
 */
export function useWebGLContextHandler(canvas: HTMLCanvasElement | null) {
  const onContextLost = useDiagnosticsStore((s) => s.onContextLost);
  const onContextRestored = useDiagnosticsStore((s) => s.onContextRestored);
  
  useEffect(() => {
    if (!canvas) return;
    
    const handleLost = (e: Event) => {
      e.preventDefault();
      onContextLost();
    };
    
    const handleRestored = () => {
      onContextRestored();
    };
    
    canvas.addEventListener('webglcontextlost', handleLost, false);
    canvas.addEventListener('webglcontextrestored', handleRestored, false);
    
    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
    };
  }, [canvas, onContextLost, onContextRestored]);
}

// ============================================
// SMOKE TEST UTILITIES
// ============================================

/**
 * Try to render a component without crashing
 * Used in CI/CD pipeline
 */
export function tryRender(
  renderFn: () => void
): 'OK' | { status: 'FAIL'; message: string } {
  try {
    renderFn();
    return 'OK';
  } catch (err: any) {
    return {
      status: 'FAIL',
      message: err?.message ?? 'Unknown error',
    };
  }
}

/**
 * Simulate context loss for testing
 */
export function simulateContextLoss(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const ext = gl.getExtension('WEBGL_lose_context');
  if (ext) {
    ext.loseContext();
    console.log('[Test] Simulated WebGL context loss');
  }
}

/**
 * Simulate context restore for testing
 */
export function simulateContextRestore(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const ext = gl.getExtension('WEBGL_lose_context');
  if (ext) {
    ext.restoreContext();
    console.log('[Test] Simulated WebGL context restore');
  }
}
