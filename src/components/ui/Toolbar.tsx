/**
 * Toolbar - Tool Selection UI Component
 * 
 * VISUAL STYLE (Industrial Silent Luxury):
 * - Dark glass background (#0d0f13)
 * - Subtle borders (#1a1a1a)
 * - Primary accent (#565449)
 * - Clean typography (Inter)
 * - HORIZONTAL layout (row)
 */


import { useToolStore, TOOL_INFO, ToolId } from '../../core/store/useToolStore';
import { useMeasureStore } from '../../core/store/useMeasureStore';

export function Toolbar() {
  const activeTool = useToolStore((s) => s.activeTool);
  const setTool = useToolStore((s) => s.setTool);
  
  const tools: ToolId[] = ['select', 'move', 'rotate', 'scale', 'uv', 'measure'];
  
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',      // ← HORIZONTAL
        gap: '4px',
        padding: '8px',
        background: '#0d0f13',
        borderRadius: '8px',
        border: '1px solid #1a1a1a',
      }}
    >
      {tools.map((toolId) => {
        const info = TOOL_INFO[toolId];
        const isActive = activeTool === toolId;
        
        return (
          <button
            key={toolId}
            onClick={() => setTool(toolId)}
            title={`${info.name} (${info.hotkey})`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              background: isActive ? '#565449' : 'transparent',
              color: isActive ? '#ffffff' : '#888888',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#1a1a1a';
                e.currentTarget.style.color = '#cccccc';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#888888';
              }
            }}
          >
            {info.icon}
          </button>
        );
      })}
    </div>
  );
}

/**
 * MeasureToolbar - Additional controls when Measure tool is active
 * This one stays vertical as it's a settings panel
 */
export function MeasureToolbar() {
  const isActive = useMeasureStore((s) => s.isActive);
  const segments = useMeasureStore((s) => s.segments);
  const showLabels = useMeasureStore((s) => s.showLabels);
  const labelUnit = useMeasureStore((s) => s.labelUnit);
  const setShowLabels = useMeasureStore((s) => s.setShowLabels);
  const setLabelUnit = useMeasureStore((s) => s.setLabelUnit);
  const clearAllSegments = useMeasureStore((s) => s.clearAllSegments);
  
  if (!isActive) return null;
  
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        background: '#0d0f13',
        borderRadius: '8px',
        border: '1px solid #1a1a1a',
        minWidth: '180px',
      }}
    >
      <div style={{ 
        fontSize: '11px', 
        textTransform: 'uppercase', 
        letterSpacing: '0.1em',
        color: '#666666',
        marginBottom: '4px',
      }}>
        Measure Tool
      </div>
      
      {/* Unit selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#888888' }}>Unit:</span>
        <select
          value={labelUnit}
          onChange={(e) => setLabelUnit(e.target.value as 'mm' | 'cm' | 'm')}
          style={{
            flex: 1,
            padding: '4px 8px',
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: '4px',
            color: '#e5e7eb',
            fontSize: '12px',
          }}
        >
          <option value="mm">Millimeters</option>
          <option value="cm">Centimeters</option>
          <option value="m">Meters</option>
        </select>
      </div>
      
      {/* Show labels toggle */}
      <label style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        cursor: 'pointer',
        fontSize: '12px',
        color: '#888888',
      }}>
        <input
          type="checkbox"
          checked={showLabels}
          onChange={(e) => setShowLabels(e.target.checked)}
          style={{ accentColor: '#565449' }}
        />
        Show Labels
      </label>
      
      {/* Segment count & clear */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        paddingTop: '8px',
        borderTop: '1px solid #1a1a1a',
      }}>
        <span style={{ fontSize: '11px', color: '#666666' }}>
          {segments.length} measurement{segments.length !== 1 ? 's' : ''}
        </span>
        
        {segments.length > 0 && (
          <button
            onClick={clearAllSegments}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid #333333',
              borderRadius: '4px',
              color: '#888888',
              fontSize: '11px',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#ff4444';
              e.currentTarget.style.color = '#ff4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#333333';
              e.currentTarget.style.color = '#888888';
            }}
          >
            Clear All
          </button>
        )}
      </div>
      
      {/* Instructions */}
      <div style={{ 
        fontSize: '10px', 
        color: '#555555',
        lineHeight: '1.4',
        paddingTop: '8px',
        borderTop: '1px solid #1a1a1a',
      }}>
        Click two points to measure distance.<br/>
        Press <kbd style={{ 
          background: '#1a1a1a', 
          padding: '1px 4px', 
          borderRadius: '2px',
          border: '1px solid #2a2a2a',
        }}>Esc</kbd> to cancel.
      </div>
    </div>
  );
}
