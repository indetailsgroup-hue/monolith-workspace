/**
 * Drag Interaction System
 *
 * Plasticity-style drag to adjust tool parameters:
 * - Drag up/down → adjust depth
 * - Drag left/right → adjust offset/width
 * - Shift + drag → fine control (0.1mm steps)
 *
 * v1.0: Initial drag interaction
 * v1.1: Added dual-axis support for depth/offset
 */

export type DragAxis = 'vertical' | 'horizontal' | 'dual';

export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  /** Which parameter is being dragged */
  parameter: string;
  /** Initial value before drag */
  initialValue: number;
  /** Current computed value */
  currentValue: number;
  /** Fine control mode (Shift held) */
  fineMode: boolean;
}

/**
 * Dual-axis drag state for simultaneous depth + offset control
 */
export interface DualAxisDragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  /** Vertical parameter (depth) */
  verticalParam: string;
  verticalInitial: number;
  verticalValue: number;
  /** Horizontal parameter (offset/width/gap) */
  horizontalParam: string;
  horizontalInitial: number;
  horizontalValue: number;
  /** Fine control mode */
  fineMode: boolean;
}

/**
 * Configuration for dual-axis drag
 */
export interface DualAxisConfig {
  vertical: {
    param: string;
    sensitivity: number;
    min: number;
    max: number;
    /** Normal drag snap (small, e.g. 0.1mm) */
    snapGrid?: number;
    /** Shift snap (precision, e.g. 0.5mm or 1mm) */
    shiftSnapGrid?: number;
  };
  horizontal: {
    param: string;
    sensitivity: number;
    min: number;
    max: number;
    /** Normal drag snap */
    snapGrid?: number;
    /** Shift snap (precision) */
    shiftSnapGrid?: number;
  };
  /** Shift mode behavior: 'snap' = snap to grid, 'fine' = reduce sensitivity */
  shiftMode: 'snap' | 'fine';
  fineSensitivityMultiplier: number;
}

export interface DragConfig {
  /** Sensitivity: pixels per mm */
  sensitivity: number;
  /** Fine mode sensitivity multiplier */
  fineSensitivityMultiplier: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Snap to grid (e.g., 0.5mm) */
  snapGrid?: number;
  /** Axis for drag direction */
  axis: DragAxis;
}

const DEFAULT_CONFIG: DragConfig = {
  sensitivity: 10, // 10px = 1mm
  fineSensitivityMultiplier: 0.1, // Shift = 10x finer
  min: 0,
  max: 50,
  snapGrid: 0.5,
  axis: 'vertical',
};

/**
 * Create initial drag state
 */
export function createDragState(
  parameter: string,
  initialValue: number,
  startX: number,
  startY: number
): DragState {
  return {
    isDragging: true,
    startX,
    startY,
    currentX: startX,
    currentY: startY,
    parameter,
    initialValue,
    currentValue: initialValue,
    fineMode: false,
  };
}

/**
 * Update drag state with new mouse position
 */
export function updateDragState(
  state: DragState,
  currentX: number,
  currentY: number,
  fineMode: boolean,
  config: Partial<DragConfig> = {}
): DragState {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Calculate delta based on axis
  const delta = cfg.axis === 'vertical'
    ? state.startY - currentY // Up = positive
    : currentX - state.startX; // Right = positive

  // Apply sensitivity
  const sensitivity = fineMode
    ? cfg.sensitivity / cfg.fineSensitivityMultiplier
    : cfg.sensitivity;

  let newValue = state.initialValue + delta / sensitivity;

  // Clamp to min/max
  newValue = Math.max(cfg.min, Math.min(cfg.max, newValue));

  // Snap to grid
  if (cfg.snapGrid) {
    newValue = Math.round(newValue / cfg.snapGrid) * cfg.snapGrid;
  }

  return {
    ...state,
    currentX,
    currentY,
    currentValue: newValue,
    fineMode,
  };
}

/**
 * End drag and return final value
 */
export function endDrag(state: DragState): number {
  return state.currentValue;
}

/**
 * Hook-friendly drag handler factory
 */
export function createDragHandlers(
  parameter: string,
  initialValue: number,
  config: Partial<DragConfig>,
  onUpdate: (value: number, isDragging: boolean) => void
) {
  let state: DragState | null = null;

  const handleMouseDown = (e: MouseEvent) => {
    state = createDragState(parameter, initialValue, e.clientX, e.clientY);
    onUpdate(state.currentValue, true);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!state) return;
    state = updateDragState(state, e.clientX, e.clientY, e.shiftKey, config);
    onUpdate(state.currentValue, true);
  };

  const handleMouseUp = () => {
    if (state) {
      onUpdate(state.currentValue, false);
    }
    cleanup();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && state) {
      onUpdate(state.initialValue, false);
      cleanup();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (state && e.key === 'Shift') {
      state = updateDragState(state, state.currentX, state.currentY, false, config);
      onUpdate(state.currentValue, true);
    }
  };

  const cleanup = () => {
    state = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };

  return {
    onMouseDown: handleMouseDown,
    cleanup,
  };
}

/**
 * Debounced value update (150ms)
 */
export function debounceUpdate<T>(
  callback: (value: T) => void,
  delay: number = 150
): (value: T) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (value: T) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      callback(value);
      timeoutId = null;
    }, delay);
  };
}

// ============================================================================
// Dual-Axis Drag System (Plasticity-style)
// ============================================================================

const DEFAULT_DUAL_CONFIG: DualAxisConfig = {
  vertical: {
    param: 'depth',
    sensitivity: 10, // 10px = 1mm
    min: 0,
    max: 50,
    snapGrid: 0.1, // Normal: 0.1mm precision
    shiftSnapGrid: 0.5, // Shift: snap to 0.5mm increments
  },
  horizontal: {
    param: 'offset',
    sensitivity: 10,
    min: 0,
    max: 100,
    snapGrid: 0.1,
    shiftSnapGrid: 1, // Shift: snap to 1mm increments
  },
  shiftMode: 'snap', // Default: Shift = snap to grid
  fineSensitivityMultiplier: 0.1,
};

/**
 * Create initial dual-axis drag state
 */
export function createDualAxisDragState(
  verticalParam: string,
  verticalInitial: number,
  horizontalParam: string,
  horizontalInitial: number,
  startX: number,
  startY: number
): DualAxisDragState {
  return {
    isDragging: true,
    startX,
    startY,
    currentX: startX,
    currentY: startY,
    verticalParam,
    verticalInitial,
    verticalValue: verticalInitial,
    horizontalParam,
    horizontalInitial,
    horizontalValue: horizontalInitial,
    fineMode: false,
  };
}

/**
 * Update dual-axis drag state
 */
export function updateDualAxisDragState(
  state: DualAxisDragState,
  currentX: number,
  currentY: number,
  shiftHeld: boolean,
  config: Partial<DualAxisConfig> = {}
): DualAxisDragState {
  const cfg = { ...DEFAULT_DUAL_CONFIG, ...config };

  // Calculate deltas
  const deltaY = state.startY - currentY; // Up = positive (depth increases)
  const deltaX = currentX - state.startX; // Right = positive (offset increases)

  // Apply sensitivity based on shift mode
  let vertSens = cfg.vertical.sensitivity;
  let horizSens = cfg.horizontal.sensitivity;

  if (shiftHeld && cfg.shiftMode === 'fine') {
    // Fine mode: reduce sensitivity for precision
    vertSens = cfg.vertical.sensitivity / cfg.fineSensitivityMultiplier;
    horizSens = cfg.horizontal.sensitivity / cfg.fineSensitivityMultiplier;
  }

  // Calculate new values
  let vertValue = state.verticalInitial + deltaY / vertSens;
  let horizValue = state.horizontalInitial + deltaX / horizSens;

  // Clamp to min/max
  vertValue = Math.max(cfg.vertical.min, Math.min(cfg.vertical.max, vertValue));
  horizValue = Math.max(cfg.horizontal.min, Math.min(cfg.horizontal.max, horizValue));

  // Snap to grid - use shiftSnapGrid when Shift held (snap mode), otherwise use normal snapGrid
  if (shiftHeld && cfg.shiftMode === 'snap') {
    // Shift + snap mode: use precision snap grid
    const vertSnap = cfg.vertical.shiftSnapGrid ?? cfg.vertical.snapGrid;
    const horizSnap = cfg.horizontal.shiftSnapGrid ?? cfg.horizontal.snapGrid;
    if (vertSnap) {
      vertValue = Math.round(vertValue / vertSnap) * vertSnap;
    }
    if (horizSnap) {
      horizValue = Math.round(horizValue / horizSnap) * horizSnap;
    }
  } else {
    // Normal mode: use regular snap grid
    if (cfg.vertical.snapGrid) {
      vertValue = Math.round(vertValue / cfg.vertical.snapGrid) * cfg.vertical.snapGrid;
    }
    if (cfg.horizontal.snapGrid) {
      horizValue = Math.round(horizValue / cfg.horizontal.snapGrid) * cfg.horizontal.snapGrid;
    }
  }

  return {
    ...state,
    currentX,
    currentY,
    verticalValue: vertValue,
    horizontalValue: horizValue,
    fineMode: shiftHeld,
  };
}

/**
 * Hook-friendly dual-axis drag handler factory
 */
export function createDualAxisDragHandlers(
  verticalParam: string,
  verticalInitial: number,
  horizontalParam: string,
  horizontalInitial: number,
  config: Partial<DualAxisConfig>,
  onUpdate: (values: { vertical: number; horizontal: number }, isDragging: boolean, cursorPos: { x: number; y: number }) => void
) {
  let state: DualAxisDragState | null = null;

  const handleMouseDown = (e: MouseEvent) => {
    state = createDualAxisDragState(
      verticalParam,
      verticalInitial,
      horizontalParam,
      horizontalInitial,
      e.clientX,
      e.clientY
    );
    onUpdate(
      { vertical: state.verticalValue, horizontal: state.horizontalValue },
      true,
      { x: e.clientX, y: e.clientY }
    );

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Set cursor to indicate dragging
    document.body.style.cursor = 'move';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!state) return;
    state = updateDualAxisDragState(state, e.clientX, e.clientY, e.shiftKey, config);
    onUpdate(
      { vertical: state.verticalValue, horizontal: state.horizontalValue },
      true,
      { x: e.clientX, y: e.clientY }
    );
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (state) {
      onUpdate(
        { vertical: state.verticalValue, horizontal: state.horizontalValue },
        false,
        { x: e.clientX, y: e.clientY }
      );
    }
    cleanup();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && state) {
      onUpdate(
        { vertical: state.verticalInitial, horizontal: state.horizontalInitial },
        false,
        { x: state.currentX, y: state.currentY }
      );
      cleanup();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (state && e.key === 'Shift') {
      state = updateDualAxisDragState(state, state.currentX, state.currentY, false, config);
      onUpdate(
        { vertical: state.verticalValue, horizontal: state.horizontalValue },
        true,
        { x: state.currentX, y: state.currentY }
      );
    }
  };

  const cleanup = () => {
    state = null;
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };

  return {
    onMouseDown: handleMouseDown,
    cleanup,
  };
}

// ============================================================================
// Cursor Position for HUD
// ============================================================================

export interface CursorHUDData {
  visible: boolean;
  x: number;
  y: number;
  values: Array<{ label: string; value: number; unit: string }>;
  /** Shift key is held */
  shiftHeld: boolean;
  /** Current snap mode */
  snapMode: 'normal' | 'shift';
  /** Current snap value (e.g., 0.5mm) */
  snapValue?: number;
}
