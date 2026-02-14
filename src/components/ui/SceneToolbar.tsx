/**
 * Scene Toolbar (Stub)
 *
 * Bottom-center toolbar for scene-level actions.
 */

export function SceneToolbar() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '6px 12px',
      background: 'rgba(26, 26, 46, 0.8)',
      backdropFilter: 'blur(8px)',
      border: '1px solid #333',
      borderRadius: 12,
      fontSize: 11,
      color: '#888',
    }}>
      Scene Tools
    </div>
  );
}
