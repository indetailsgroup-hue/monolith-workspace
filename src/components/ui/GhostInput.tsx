/**
 * GhostInput - Dimension Input with Scrubbing
 *
 * Compact numeric input with:
 * - Click-drag on label to scrub values
 * - Unit suffix (mm/cm/m)
 * - Min/max constraints
 * - Step increments
 *
 * @version 1.0.0
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';

export interface GhostInputProps {
  /** Input label */
  label: string;
  /** Current value in base unit (mm) */
  value: number;
  /** On value change */
  onChange: (value: number) => void;
  /** Display unit */
  unit?: 'mm' | 'cm' | 'm';
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment for scrubbing */
  step?: number;
  /** Decimal precision for display */
  precision?: number;
  /** Read-only mode */
  readOnly?: boolean;
  /** Additional className */
  className?: string;
  /** Scrub sensitivity (pixels per step) */
  scrubSensitivity?: number;
}

// Unit conversion factors (to/from mm)
const unitFactors: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
};

export function GhostInput({
  label,
  value,
  onChange,
  unit = 'mm',
  min = 0,
  max = 10000,
  step = 1,
  precision = 0,
  readOnly = false,
  className = '',
  scrubSensitivity = 2,
}: GhostInputProps) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const scrubStartRef = useRef<{ x: number; value: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Convert value to display unit
  const displayValue = value / unitFactors[unit];
  const displayMin = min / unitFactors[unit];
  const displayMax = max / unitFactors[unit];
  const displayStep = step / unitFactors[unit];

  // Format display value
  const formattedValue = displayValue.toFixed(precision);

  // Handle scrub start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly || isEditing) return;
      e.preventDefault();
      setIsScrubbing(true);
      scrubStartRef.current = { x: e.clientX, value: displayValue };
      document.body.style.cursor = 'ew-resize';
    },
    [readOnly, isEditing, displayValue]
  );

  // Handle scrub move
  useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrubStartRef.current) return;

      const delta = e.clientX - scrubStartRef.current.x;
      const steps = Math.round(delta / scrubSensitivity);
      const newDisplayValue = scrubStartRef.current.value + steps * displayStep;
      const clampedDisplay = Math.max(displayMin, Math.min(displayMax, newDisplayValue));
      const newValue = clampedDisplay * unitFactors[unit];

      onChange(Math.round(newValue / step) * step);
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
      scrubStartRef.current = null;
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, displayStep, displayMin, displayMax, unit, step, onChange, scrubSensitivity]);

  // Handle click to edit
  const handleValueClick = useCallback(() => {
    if (readOnly) return;
    setIsEditing(true);
    setInputValue(formattedValue);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  }, [readOnly, formattedValue]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // Handle input blur/submit
  const handleInputSubmit = useCallback(() => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      const clampedDisplay = Math.max(displayMin, Math.min(displayMax, parsed));
      const newValue = clampedDisplay * unitFactors[unit];
      onChange(Math.round(newValue / step) * step);
    }
    setIsEditing(false);
  }, [inputValue, displayMin, displayMax, unit, step, onChange]);

  // Handle key events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputSubmit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className={`flex items-center justify-between h-6 ${className}`}>
      {/* Label (scrub target) */}
      <span
        className={`ghost-input-label text-[11px] text-textc-secondary select-none ${
          readOnly ? '' : 'cursor-ew-resize'
        } ${isScrubbing ? 'text-accent-purple' : ''}`}
        onMouseDown={handleMouseDown}
      >
        {label}
      </span>

      {/* Value */}
      <div className="flex items-center gap-1">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputSubmit}
            onKeyDown={handleKeyDown}
            className="ghost-input-value w-14 h-5 px-1 text-right text-[11px] font-mono text-textc-primary bg-transparent border-none outline-none rounded"
            autoFocus
          />
        ) : (
          <span
            className={`ghost-input-value text-[11px] font-mono text-textc-primary ${
              readOnly ? '' : 'cursor-text hover:bg-surface-3'
            } px-1 rounded`}
            onClick={handleValueClick}
          >
            {formattedValue}
          </span>
        )}
        <span className="text-[9px] text-textc-muted w-5">{unit}</span>
      </div>
    </div>
  );
}

// Row of ghost inputs (e.g., X, Y, Z)
export interface GhostInputRowProps {
  children: React.ReactNode;
  className?: string;
}

export function GhostInputRow({ children, className = '' }: GhostInputRowProps) {
  return (
    <div className={`flex gap-2 ${className}`}>
      {children}
    </div>
  );
}

// Compact XYZ input group
export interface XYZInputProps {
  values: [number, number, number];
  onChange: (values: [number, number, number]) => void;
  labels?: [string, string, string];
  unit?: 'mm' | 'cm' | 'm';
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  readOnly?: boolean;
}

export function XYZInput({
  values,
  onChange,
  labels = ['X', 'Y', 'Z'],
  unit = 'mm',
  min,
  max,
  step,
  precision,
  readOnly,
}: XYZInputProps) {
  const handleChange = (index: number) => (newValue: number) => {
    const newValues = [...values] as [number, number, number];
    newValues[index] = newValue;
    onChange(newValues);
  };

  const colors = ['text-red-400', 'text-green-400', 'text-blue-400'];

  return (
    <div className="flex gap-3">
      {labels.map((label, i) => (
        <div key={label} className="flex-1">
          <GhostInput
            label={label}
            value={values[i]}
            onChange={handleChange(i)}
            unit={unit}
            min={min}
            max={max}
            step={step}
            precision={precision}
            readOnly={readOnly}
            className={colors[i]}
          />
        </div>
      ))}
    </div>
  );
}

export default GhostInput;
