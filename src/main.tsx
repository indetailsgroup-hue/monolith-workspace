import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './routes';
import './index.css';
import { readTheme, writeTheme } from './core/persistence/appPrefs';

// One-time migration: reset theme to dark (v2.1 fix)
// Old logic auto-set 'light' from OS preference - clear that
const THEME_MIGRATED_KEY = 'theme_v2_migrated';
if (!localStorage.getItem(THEME_MIGRATED_KEY)) {
  writeTheme('dark');
  localStorage.setItem(THEME_MIGRATED_KEY, '1');
}

// One-time migration: fix Minifix camDepth 12.5→13.5 for 18mm wood (v3.0 fix)
// Old defaults used 12.5mm (correct for 16mm wood) but project default is 18mm → 13.5mm
// Patches any saved project data in localStorage so drill map regeneration uses correct depth
const MINIFIX_DEPTH_MIGRATED_KEY = 'minifix_v3_camDepth_migrated';
if (!localStorage.getItem(MINIFIX_DEPTH_MIGRATED_KEY)) {
  try {
    const projectRaw = localStorage.getItem('monolith-current-project');
    if (projectRaw) {
      const project = JSON.parse(projectRaw);
      let patched = false;

      // Patch helper: fix minifixConfig for 18mm wood
      const patchConfig = (cfg: Record<string, unknown>) => {
        if (!cfg) return false;
        let changed = false;
        const thickness = (cfg.woodThickness as number) ?? 18;
        if (thickness === 18 || thickness === 0) {
          if (cfg.camDepth === 12.5) { cfg.camDepth = 13.5; changed = true; }
          if (cfg.camHeight === 8) { cfg.camHeight = 9; changed = true; }
          if (cfg.ballHeadDia === 7.5) { cfg.ballHeadDia = 6.5; changed = true; }
        }
        return changed;
      };

      // Patch main cabinet
      if (project.cabinet?.hardware?.minifixConfig) {
        if (patchConfig(project.cabinet.hardware.minifixConfig)) patched = true;
      }

      // Patch all cabinets in array
      if (Array.isArray(project.cabinets)) {
        for (const cab of project.cabinets) {
          if (cab?.hardware?.minifixConfig) {
            if (patchConfig(cab.hardware.minifixConfig)) patched = true;
          }
        }
      }

      if (patched) {
        localStorage.setItem('monolith-current-project', JSON.stringify(project));
      }
    }
  } catch {
    // Silently ignore migration errors - defaults will apply on next preset
  }
  localStorage.setItem(MINIFIX_DEPTH_MIGRATED_KEY, '1');
}

const initialTheme = readTheme();

document.documentElement.dataset.theme = initialTheme;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
);
