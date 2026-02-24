/**
 * InfiniteGrid - Biophilic Render Engine Grid
 * 
 * Features:
 * - Infinite grid with fade distance
 * - Configurable cell size and section size
 * - Double right-click to open settings popup
 * - Draggable settings popup
 * - Dark theme matching the render engine style
 */

import { useState, useRef, useCallback } from 'react';
import { Grid, Html } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

// Grid Settings Store
interface GridSettings {
  enabled: boolean;
  cellSize: number;      // mm
  sectionSize: number;   // mm (thick lines every N cells)
  fadeDistance: number;  // meters
}

const DEFAULT_GRID_SETTINGS: GridSettings = {
  enabled: true,
  cellSize: 100,
  sectionSize: 1000,
  fadeDistance: 78,
};

interface InfiniteGridProps {
  settings?: Partial<GridSettings>;
  onSettingsChange?: (settings: GridSettings) => void;
}

export function InfiniteGrid({ settings: propSettings, onSettingsChange }: InfiniteGridProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<GridSettings>({
    ...DEFAULT_GRID_SETTINGS,
    ...propSettings,
  });
  
  // Popup position state
  const [popupPosition, setPopupPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  
  // Double right-click detection
  const lastRightClickTime = useRef(0);
  const DOUBLE_CLICK_THRESHOLD = 400; // ms
  
  const handleSettingChange = (key: keyof GridSettings, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange?.(newSettings);
  };
  
  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    
    const now = Date.now();
    const timeSinceLastClick = now - lastRightClickTime.current;
    
    if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
      // Double right-click detected
      // Position popup near click location
      setPopupPosition({ 
        x: (e.nativeEvent as MouseEvent).clientX - 140,
        y: (e.nativeEvent as MouseEvent).clientY - 50
      });
      setShowSettings(true);
      lastRightClickTime.current = 0; // Reset
    } else {
      lastRightClickTime.current = now;
    }
  }, []);
  
  // Drag handlers for popup
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - popupPosition.x,
        y: e.clientY - popupPosition.y,
      };
      e.preventDefault();
    }
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      setPopupPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    }
  }, [isDragging]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  // Add/remove global mouse listeners for dragging
  useState(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  });
  
  if (!localSettings.enabled) return null;
  
  // Calculate section ratio (how many cells per section)
  const sectionRatio = Math.max(1, Math.round(localSettings.sectionSize / localSettings.cellSize));
  
  return (
    <group>
      {/* Clickable plane for context menu */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.5, 0]}
        onContextMenu={handleContextMenu}
      >
        <planeGeometry args={[100000, 100000]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
      
      {/* drei Grid - stable, no flickering */}
      <Grid
        position={[0, 0, 0]}
        args={[100000, 100000]}
        cellSize={localSettings.cellSize}
        cellThickness={0.6}
        cellColor="#2a2a2a"
        sectionSize={localSettings.cellSize * sectionRatio}
        sectionThickness={1.2}
        sectionColor="#3a3a3a"
        fadeDistance={localSettings.fadeDistance * 1000}
        fadeStrength={1.5}
        followCamera={false}
        infiniteGrid={true}
      />
      
      {/* Settings Popup - Rendered in portal outside Canvas */}
      {showSettings && (
        <Html
          calculatePosition={() => [0, 0, 0]}
          style={{ 
            position: 'fixed',
            left: popupPosition.x,
            top: popupPosition.y,
            pointerEvents: 'auto',
            zIndex: 1000,
          }}
        >
          <div 
            className="bg-zinc-900/95 backdrop-blur-sm rounded-lg border border-zinc-700 shadow-2xl min-w-[280px] select-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={handleMouseDown}
          >
            {/* Draggable Header */}
            <div className="drag-handle flex items-center justify-between p-3 border-b border-zinc-800 cursor-move">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
                <h3 className="text-white font-semibold text-sm tracking-wide">GRID SETTINGS</h3>
              </div>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-zinc-400 hover:text-white transition-colors p-1 hover:bg-zinc-800 rounded"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4">
              {/* Infinite Grid Toggle */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-zinc-300 text-sm">Infinite Grid</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.enabled}
                    onChange={(e) => handleSettingChange('enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              
              {/* Cell Size */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-300 text-sm">Cell Size</span>
                  <span className="text-zinc-400 text-sm">{localSettings.cellSize}mm</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={localSettings.cellSize}
                  onChange={(e) => handleSettingChange('cellSize', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
              
              {/* Section Size */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-300 text-sm">Section Size</span>
                  <span className="text-zinc-400 text-sm">{localSettings.sectionSize}mm</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="5000"
                  step="100"
                  value={localSettings.sectionSize}
                  onChange={(e) => handleSettingChange('sectionSize', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
              
              {/* Fade Distance */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-300 text-sm">Fade Distance</span>
                  <span className="text-zinc-400 text-sm">{localSettings.fadeDistance}m</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="1"
                  value={localSettings.fadeDistance}
                  onChange={(e) => handleSettingChange('fadeDistance', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
            
            {/* Footer hint */}
            <div className="px-4 pb-3">
              <p className="text-xs text-zinc-500">Double right-click on grid to open</p>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default InfiniteGrid;
