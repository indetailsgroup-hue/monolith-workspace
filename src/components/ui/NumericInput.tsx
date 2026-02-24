/**
 * Numeric Input - Inline Value Entry with History
 *
 * Plasticity-style direct value entry:
 * - Click to edit
 * - Type value, press Enter to confirm
 * - Escape to cancel
 * - Up/Down arrows to increment/decrement
 * - History of recent values
 *
 * v1.0: Initial numeric input
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface NumericInputProps {
  /** Current value */
  value: number;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Label shown above the input */
  label: string;
  /** Unit suffix (e.g., "mm") */
  unit?: string;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Step for arrow key increments */
  step?: number;
  /** Decimal precision for display */
  precision?: number;
  /** Accent color */
  color?: string;
  /** Compact mode (smaller) */
  compact?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

export function NumericInput({
  value,
  onChange,
  label,
  unit = 'mm',
  min = 0,
  max = 1000,
  step = 0.5,
  precision = 1,
  color = '#8b5cf6',
  compact = false,
  disabled = false,
}: NumericInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [history, setHistory] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = useCallback(() => {
    if (disabled) return;
    setEditValue(value.toFixed(precision));
    setIsEditing(true);
  }, [value, precision, disabled]);

  const commitValue = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      // Add to history if different from current
      if (clamped !== value) {
        setHistory((prev) => {
          const newHistory = [value, ...prev.filter((v) => v !== value)].slice(0, 5);
          return newHistory;
        });
        onChange(clamped);
      }
    }
    setIsEditing(false);
  }, [editValue, min, max, value, onChange]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitValue();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEditing();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newValue = Math.min(max, parseFloat(editValue || '0') + step);
        setEditValue(newValue.toFixed(precision));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newValue = Math.max(min, parseFloat(editValue || '0') - step);
        setEditValue(newValue.toFixed(precision));
      }
    },
    [commitValue, cancelEditing, editValue, min, max, step, precision]
  );

  const handleQuickValue = useCallback(
    (quickValue: number) => {
      onChange(quickValue);
      setIsEditing(false);
    },
    [onChange]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 2 : 4,
      }}
    >
      {/* Label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: compact ? 10 : 11,
            fontWeight: 500,
            color: '#9ca3af',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {label}
        </span>
        {!isEditing && history.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {history.slice(0, 3).map((histValue, i) => (
              <button
                key={i}
                onClick={() => handleQuickValue(histValue)}
                style={{
                  padding: '2px 6px',
                  fontSize: 9,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 3,
                  color: '#6b7280',
                  cursor: 'pointer',
                }}
                title={`Set to ${histValue}${unit}`}
              >
                {histValue.toFixed(precision)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input field */}
      {isEditing ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: compact ? '6px 10px' : '8px 12px',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            border: `2px solid ${color}`,
            borderRadius: 8,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitValue}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: compact ? 14 : 16,
              fontWeight: 700,
              fontFamily: 'monospace',
              textAlign: 'right',
              width: '100%',
            }}
          />
          <span
            style={{
              fontSize: compact ? 11 : 12,
              color: '#6b7280',
            }}
          >
            {unit}
          </span>
        </div>
      ) : (
        <button
          onClick={startEditing}
          disabled={disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: compact ? '6px 10px' : '8px 12px',
            backgroundColor: disabled ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
            opacity: disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.borderColor = `${color}60`;
              e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
          }}
        >
          <span
            style={{
              fontSize: compact ? 14 : 16,
              fontWeight: 700,
              color: '#fff',
              fontFamily: 'monospace',
            }}
          >
            {value.toFixed(precision)}
          </span>
          <span
            style={{
              fontSize: compact ? 11 : 12,
              color: '#6b7280',
            }}
          >
            {unit}
          </span>
        </button>
      )}

      {/* Editing hints */}
      {isEditing && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            fontSize: 9,
            color: '#6b7280',
          }}
        >
          <span>↵ Confirm</span>
          <span>Esc Cancel</span>
          <span>↑↓ Adjust</span>
        </div>
      )}
    </div>
  );
}

/**
 * Inline numeric input (compact, single-line)
 */
interface InlineNumericInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
}

export function InlineNumericInput({
  value,
  onChange,
  label,
  unit = 'mm',
  min = 0,
  max = 1000,
  step = 0.5,
  precision = 1,
}: InlineNumericInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setEditValue(value.toFixed(precision));
    setIsEditing(true);
  };

  const commit = () => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setEditValue((parseFloat(editValue || '0') + step).toFixed(precision));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setEditValue(Math.max(min, parseFloat(editValue || '0') - step).toFixed(precision));
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: '#9ca3af',
          minWidth: 50,
        }}
      >
        {label}
      </span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          style={{
            width: 60,
            padding: '4px 8px',
            backgroundColor: 'rgba(139, 92, 246, 0.2)',
            border: '1px solid #8b5cf6',
            borderRadius: 4,
            color: '#fff',
            fontSize: 12,
            fontFamily: 'monospace',
            textAlign: 'right',
            outline: 'none',
          }}
        />
      ) : (
        <button
          onClick={startEditing}
          style={{
            padding: '4px 8px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 4,
            color: '#fff',
            fontSize: 12,
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          {value.toFixed(precision)}
        </button>
      )}
      <span
        style={{
          fontSize: 11,
          color: '#6b7280',
        }}
      >
        {unit}
      </span>
    </div>
  );
}

export default NumericInput;
