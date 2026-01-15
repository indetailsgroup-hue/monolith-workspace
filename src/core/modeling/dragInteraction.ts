/**
 * Drag Interaction System
 *
 * Plasticity-style drag to adjust tool parameters:
 * - Drag up/down → adjust depth
 * - Drag left/right → adjust offset/width
 * - Shift + drag → fine control (0.1mm steps)
 *
 * v1.0: Initial drag interaction
 */

export type DragAxis = 'vertical' | 'horizontal';

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
