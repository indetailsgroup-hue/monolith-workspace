/**
 * ProjectToolbar - Save/Load/Export UI
 * 
 * Features:
 * - Project name display & edit
 * - Save status indicator
 * - New/Save/Load/Export buttons
 * - File import
 */

import React, { useState, useRef } from 'react';
import { useProjectStore, useProject, useProjectDirty } from '../../core/store/useProjectStore';

export function ProjectToolbar() {
  const project = useProject();
  const isDirty = useProjectDirty();
  const lastSaved = useProjectStore((s) => s.lastSaved);
  const savedProjects = useProjectStore((s) => s.savedProjects);
  
  const newProject = useProjectStore((s) => s.newProject);
  const saveProject = useProjectStore((s) => s.saveProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const downloadProject = useProjectStore((s) => s.downloadProject);
  const importProject = useProjectStore((s) => s.importProject);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleStartEdit = () => {
    setEditName(project?.name || '');
    setIsEditing(true);
  };
  
  const handleSaveName = () => {
    if (editName.trim()) {
      setProjectName(editName.trim());
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };
  
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const json = event.target?.result as string;
      const success = importProject(json);
      if (success) {
        alert('Project imported successfully!');
      } else {
        alert('Failed to import project. Invalid file format.');
      }
    };
    reader.readAsText(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleNewProject = () => {
    if (isDirty) {
      const confirmed = confirm('You have unsaved changes. Create new project anyway?');
      if (!confirmed) return;
    }
    const name = prompt('Enter project name:', 'New Cabinet');
    if (name) {
      newProject(name);
    }
    setShowMenu(false);
  };
  
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div className="flex items-center gap-3">
      {/* Project Name */}
      <div className="flex items-center gap-2">
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={handleKeyDown}
            autoFocus
            className="bg-zinc-800 border border-emerald-500 rounded px-2 py-1 text-sm text-white focus:outline-none w-48"
          />
        ) : (
          <button
            onClick={handleStartEdit}
            className="text-sm font-medium text-white hover:text-emerald-400 transition-colors"
            title="Click to rename"
          >
            {project?.name || 'Untitled'}
          </button>
        )}
        
        {/* Save Status */}
        {isDirty ? (
          <span className="text-xs text-amber-400" title="Unsaved changes">●</span>
        ) : (
          <span className="text-xs text-emerald-400" title="All changes saved">✓</span>
        )}
      </div>
      
      {/* Last Saved */}
      {lastSaved && (
        <span className="text-xs text-zinc-500">
          Saved {formatTime(lastSaved)}
        </span>
      )}
      
      {/* Toolbar Buttons */}
      <div className="flex items-center gap-1 ml-2">
        {/* Save Button */}
        <button
          onClick={() => saveProject()}
          className="px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors"
          title="Save (Ctrl+S)"
        >
          💾 Save
        </button>
        
        {/* Menu Button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors"
          >
            ☰ Menu
          </button>
          
          {showMenu && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50">
              <button
                onClick={handleNewProject}
                className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white"
              >
                📄 New Project
              </button>
              
              <button
                onClick={() => { setShowLoadMenu(!showLoadMenu); }}
                className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center justify-between"
              >
                📂 Load Project
                <span className="text-zinc-500">▶</span>
              </button>
              
              <hr className="border-zinc-700 my-1" />
              
              <button
                onClick={() => { downloadProject(); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white"
              >
                ⬇️ Export JSON
              </button>
              
              <button
                onClick={() => { fileInputRef.current?.click(); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white"
              >
                ⬆️ Import JSON
              </button>
              
              {/* Recent Projects Submenu */}
              {showLoadMenu && savedProjects.length > 0 && (
                <div className="absolute left-full top-8 ml-1 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl">
                  <div className="px-3 py-2 text-xs text-zinc-500 border-b border-zinc-700">
                    Recent Projects
                  </div>
                  {savedProjects.slice(0, 5).map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => {
                        loadProject(proj.id);
                        setShowMenu(false);
                        setShowLoadMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    >
                      <div className="truncate">{proj.name}</div>
                      <div className="text-xs text-zinc-500">
                        {new Date(proj.updatedAt).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.monolith.json"
        onChange={handleFileImport}
        className="hidden"
      />
      
      {/* Click outside to close menu */}
      {showMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => { setShowMenu(false); setShowLoadMenu(false); }}
        />
      )}
    </div>
  );
}

export default ProjectToolbar;
