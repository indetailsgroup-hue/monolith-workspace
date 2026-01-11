/**
 * ExportPanel - Gate & Export System
 * 
 * SPEC-08 Compliant export workflow:
 * - Validation checks (dimensional, structural, machine compatibility)
 * - Gate status management (DRAFT → FROZEN → RELEASED)
 * - Export formats (DXF, Cut List, BOM, CNC)
 */

import React, { useState, useMemo } from 'react';
import { useCabinet } from '../../core/store/useCabinetStore';

// Validation types
interface ValidationResult {
  id: string;
  category: 'dimension' | 'structure' | 'material' | 'machine' | 'safety';
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: string;
}

// Gate status
export type GateStatus = 'DRAFT' | 'FROZEN' | 'RELEASED';

// Export format types
type ExportFormat = 'dxf' | 'cutlist' | 'bom' | 'cnc' | 'pdf';

interface ExportOption {
  id: ExportFormat;
  name: string;
  description: string;
  icon: string;
  requiresGate: GateStatus;
}

const EXPORT_OPTIONS: ExportOption[] = [
  { id: 'cutlist', name: 'Cut List', description: 'Panel dimensions for manual cutting', icon: '📋', requiresGate: 'DRAFT' },
  { id: 'bom', name: 'Bill of Materials', description: 'Complete material requirements', icon: '📦', requiresGate: 'DRAFT' },
  { id: 'dxf', name: 'DXF Files', description: 'CAD-ready panel drawings', icon: '📐', requiresGate: 'FROZEN' },
  { id: 'cnc', name: 'CNC Program', description: 'Machine-ready G-code', icon: '🔧', requiresGate: 'RELEASED' },
  { id: 'pdf', name: 'Production PDF', description: 'Print-ready documentation', icon: '📄', requiresGate: 'FROZEN' },
];

// Validation rules
function runValidation(cabinet: any): ValidationResult[] {
  const results: ValidationResult[] = [];
  
  if (!cabinet) return results;
  
  // Dimensional checks
  if (cabinet.dimensions.width < 300) {
    results.push({
      id: 'dim-width-min',
      category: 'dimension',
      severity: 'error',
      message: 'Width too small',
      details: `Minimum width is 300mm, current: ${cabinet.dimensions.width}mm`
    });
  }
  if (cabinet.dimensions.width > 1200) {
    results.push({
      id: 'dim-width-max',
      category: 'dimension',
      severity: 'warning',
      message: 'Width exceeds standard',
      details: `Standard max is 1200mm, current: ${cabinet.dimensions.width}mm`
    });
  }
  if (cabinet.dimensions.height > 2400) {
    results.push({
      id: 'dim-height-max',
      category: 'dimension',
      severity: 'error',
      message: 'Height exceeds machine limit',
      details: `Machine limit is 2400mm, current: ${cabinet.dimensions.height}mm`
    });
  }
  
  // Structural checks
  if (cabinet.structure.shelfCount > 6) {
    results.push({
      id: 'struct-shelves',
      category: 'structure',
      severity: 'warning',
      message: 'Many shelves may cause sagging',
      details: `Consider adding vertical dividers for ${cabinet.structure.shelfCount} shelves`
    });
  }
  
  const shelfSpacing = cabinet.dimensions.height / (cabinet.structure.shelfCount + 1);
  if (shelfSpacing < 150) {
    results.push({
      id: 'struct-spacing',
      category: 'structure',
      severity: 'warning',
      message: 'Shelf spacing too tight',
      details: `Current spacing: ${shelfSpacing.toFixed(0)}mm, minimum recommended: 150mm`
    });
  }
  
  // Material checks
  if (!cabinet.materials.defaultCore) {
    results.push({
      id: 'mat-core',
      category: 'material',
      severity: 'error',
      message: 'No core material selected',
      details: 'Select a core material before export'
    });
  }
  
  // Machine compatibility
  const panelCount = cabinet.panels?.length || 0;
  if (panelCount > 20) {
    results.push({
      id: 'machine-panels',
      category: 'machine',
      severity: 'info',
      message: 'Large panel count',
      details: `${panelCount} panels - consider batch processing`
    });
  }
  
  // Safety checks
  if (!cabinet.structure.hasBackPanel) {
    results.push({
      id: 'safety-back',
      category: 'safety',
      severity: 'warning',
      message: 'No back panel',
      details: 'Cabinet may lack structural rigidity'
    });
  }
  
  // Add success if no errors
  if (results.filter(r => r.severity === 'error').length === 0) {
    results.push({
      id: 'validation-pass',
      category: 'structure',
      severity: 'info',
      message: 'All critical checks passed',
      details: 'Cabinet is ready for export'
    });
  }
  
  return results;
}

// Section Component
function Section({ title, children, status }: { title: string; children: React.ReactNode; status?: 'ok' | 'warning' | 'error' }) {
  const [isOpen, setIsOpen] = useState(true);
  
  const statusColors = {
    ok: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };
  
  return (
    <div className="border-b border-zinc-800">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300">{title}</span>
          {status && <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />}
        </div>
        <svg 
          className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

// Validation Item
function ValidationItem({ result }: { result: ValidationResult }) {
  const severityStyles = {
    error: { bg: 'bg-red-500/10', text: 'text-red-400', icon: '✕' },
    warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: '⚠' },
    info: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'ℹ' },
  };
  
  const style = severityStyles[result.severity];
  
  return (
    <div className={`p-3 rounded-lg ${style.bg}`}>
      <div className="flex items-start gap-2">
        <span className={style.text}>{style.icon}</span>
        <div className="flex-1">
          <div className={`text-sm ${style.text}`}>{result.message}</div>
          {result.details && (
            <div className="text-xs text-zinc-500 mt-1">{result.details}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export Button
function ExportButton({ 
  option, 
  gateStatus, 
  onExport 
}: { 
  option: ExportOption; 
  gateStatus: GateStatus; 
  onExport: (format: ExportFormat) => void;
}) {
  const gateOrder: GateStatus[] = ['DRAFT', 'FROZEN', 'RELEASED'];
  const currentGateIndex = gateOrder.indexOf(gateStatus);
  const requiredGateIndex = gateOrder.indexOf(option.requiresGate);
  const isEnabled = currentGateIndex >= requiredGateIndex;
  
  return (
    <button
      onClick={() => isEnabled && onExport(option.id)}
      disabled={!isEnabled}
      className={`w-full p-4 rounded-lg border transition-colors text-left
        ${isEnabled 
          ? 'bg-zinc-800/50 border-zinc-700 hover:border-emerald-500/50 hover:bg-zinc-800 cursor-pointer' 
          : 'bg-zinc-900/50 border-zinc-800 cursor-not-allowed opacity-50'
        }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{option.icon}</span>
        <div className="flex-1">
          <div className={`text-sm font-medium ${isEnabled ? 'text-white' : 'text-zinc-500'}`}>
            {option.name}
          </div>
          <div className="text-xs text-zinc-500">{option.description}</div>
        </div>
        {!isEnabled && (
          <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
            Requires {option.requiresGate}
          </span>
        )}
      </div>
    </button>
  );
}

interface ExportPanelProps {
  gateStatus: GateStatus;
  onGateChange: (status: GateStatus) => void;
}

export function ExportPanel({ gateStatus, onGateChange }: ExportPanelProps) {
  const cabinet = useCabinet();
  const [_isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  
  // Run validation
  const validationResults = useMemo(() => runValidation(cabinet), [cabinet]);
  
  const errorCount = validationResults.filter(r => r.severity === 'error').length;
  const warningCount = validationResults.filter(r => r.severity === 'warning').length;
  
  const canFreeze = errorCount === 0;
  const canRelease = errorCount === 0 && gateStatus === 'FROZEN';
  
  const overallStatus = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ok';
  
  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    setExportProgress(`Generating ${format.toUpperCase()}...`);
    
    // Simulate export
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setExportProgress(`${format.toUpperCase()} exported successfully!`);
    setTimeout(() => {
      setIsExporting(false);
      setExportProgress(null);
    }, 2000);
  };
  
  const handleGateAction = () => {
    if (gateStatus === 'DRAFT' && canFreeze) {
      onGateChange('FROZEN');
    } else if (gateStatus === 'FROZEN' && canRelease) {
      onGateChange('RELEASED');
    } else if (gateStatus === 'FROZEN') {
      onGateChange('DRAFT'); // Unfreeze
    }
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Gate Status */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-zinc-300">Gate Status</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium
            ${gateStatus === 'DRAFT' ? 'bg-amber-500/20 text-amber-400' : ''}
            ${gateStatus === 'FROZEN' ? 'bg-blue-500/20 text-blue-400' : ''}
            ${gateStatus === 'RELEASED' ? 'bg-emerald-500/20 text-emerald-400' : ''}
          `}>
            {gateStatus}
          </span>
        </div>
        
        {/* Gate Progress */}
        <div className="flex items-center gap-2 mb-4">
          {(['DRAFT', 'FROZEN', 'RELEASED'] as GateStatus[]).map((status, i) => (
            <React.Fragment key={status}>
              <div className={`flex-1 h-2 rounded-full transition-colors
                ${gateStatus === status ? 'bg-emerald-500' : 
                  (['DRAFT', 'FROZEN', 'RELEASED'].indexOf(gateStatus) > i ? 'bg-emerald-500/50' : 'bg-zinc-700')
                }`} 
              />
              {i < 2 && <div className="w-4" />}
            </React.Fragment>
          ))}
        </div>
        
        {/* Gate Action Button */}
        <button
          onClick={handleGateAction}
          disabled={gateStatus === 'RELEASED' || (gateStatus === 'DRAFT' && !canFreeze)}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors
            ${gateStatus === 'DRAFT' && canFreeze ? 'bg-blue-500 hover:bg-blue-600 text-white' : ''}
            ${gateStatus === 'FROZEN' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : ''}
            ${gateStatus === 'RELEASED' ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : ''}
            ${gateStatus === 'DRAFT' && !canFreeze ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : ''}
          `}
        >
          {gateStatus === 'DRAFT' && (canFreeze ? 'Freeze Spec' : 'Fix Errors to Freeze')}
          {gateStatus === 'FROZEN' && 'Release for Production'}
          {gateStatus === 'RELEASED' && 'Spec Released ✓'}
        </button>
      </div>
      
      {/* Validation Results */}
      <Section title="Validation" status={overallStatus}>
        <div className="space-y-2">
          {validationResults.map((result) => (
            <ValidationItem key={result.id} result={result} />
          ))}
        </div>
      </Section>
      
      {/* Export Options */}
      <Section title="Export">
        <div className="space-y-2">
          {EXPORT_OPTIONS.map((option) => (
            <ExportButton
              key={option.id}
              option={option}
              gateStatus={gateStatus}
              onExport={handleExport}
            />
          ))}
        </div>
      </Section>
      
      {/* Export Progress */}
      {exportProgress && (
        <div className="p-4 bg-emerald-500/10 border-t border-emerald-500/30">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
            <span className="text-sm text-emerald-400">{exportProgress}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExportPanel;
