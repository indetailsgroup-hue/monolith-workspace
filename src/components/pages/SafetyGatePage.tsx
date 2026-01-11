/**
 * SafetyGatePage - IIMOS Manufacturing OS Theme
 * 
 * Full Safety & Gate dashboard matching the reference design:
 * - Safety Overview with verdict
 * - Rules validation table
 * - Panels & Fittings summary
 * - Gate Decision panel
 * - Export Integrity section
 */

import { useState } from 'react';
import { useCabinet } from '../../core/store/useCabinetStore';

// Types
type Verdict = 'PASS' | 'WARN' | 'FAIL';
type RuleStatus = 'PASS' | 'WARN' | 'FAIL';
type GateDecision = 'Approved' | 'Pending' | 'Rejected';

interface Rule {
  id: string;
  ruleId: string;
  description: string;
  status: RuleStatus;
  margin: string;
}

interface PanelInfo {
  id: string;
  role: string;
  material: string;
  thickness: string;
  weight: string;
}

interface FittingInfo {
  id: string;
  name: string;
  maxLoad: string;
  used: number;
}

// Navigation items
const NAV_ITEMS = [
  { id: 'summary', label: 'Summary' },
  { id: 'rules', label: 'Rules' },
  { id: 'panels', label: 'Panels & Fittings' },
  { id: 'export', label: 'Export Integrity' },
  { id: 'history', label: 'History & Audit' },
];

// Badge Component
function Badge({ variant, children }: { variant: 'pass' | 'warn' | 'fail' | 'approved' | 'pending' | 'released'; children: React.ReactNode }) {
  const styles = {
    pass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    warn: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    fail: 'bg-red-500/20 text-red-400 border-red-500/30',
    approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    released: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[variant]}`}>
      {children}
    </span>
  );
}

// Stat Card Component
function StatCard({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      {description && <div className="text-xs text-zinc-500 mt-1">{description}</div>}
    </div>
  );
}

// Section Header
function SectionHeader({ title, engine }: { title: string; engine?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{title}</h3>
      {engine && <span className="text-xs text-zinc-600">Engine: {engine}</span>}
    </div>
  );
}

// Main Component
export function SafetyGatePage() {
  const cabinet = useCabinet();
  const [activeNav, setActiveNav] = useState('rules');
  
  // Mock data based on cabinet
  const jobId = 'JOB-2025-001';
  const snapshotId = 'SNAP-2025-03';
  const machine = 'KDT-1320 + Biesse Rover A';
  const profile = '1536';
  
  // Calculate verdict based on cabinet
  // const _panelCount = cabinet?.panels?.length || 0;
  const hasWarnings = (cabinet?.structure?.shelfCount || 0) > 5;
  const hasErrors = false; const verdict: Verdict = hasErrors ? 'FAIL' : hasWarnings ? 'WARN' : 'PASS';
  
  // Rules data
  const rules: Rule[] = [
    { id: '1', ruleId: 'LOAD_VS_BRACKET', description: 'Panel load vs bracket capacity', status: 'PASS', margin: '2.4×' },
    { id: '2', ruleId: 'HINGE_CAPACITY', description: 'Door weight vs hinge rating', status: 'PASS', margin: '1.9×' },
    { id: '3', ruleId: 'SPAN_LIMIT', description: 'Shelf span vs thickness & material', status: hasWarnings ? 'WARN' : 'PASS', margin: '1.3×' },
    { id: '4', ruleId: 'EDGE_CLEARANCE', description: 'Edge banding vs panel edge distance', status: 'PASS', margin: '3.1×' },
    { id: '5', ruleId: 'GRAIN_DIRECTION', description: 'Grain alignment vs structural load', status: 'PASS', margin: '2.8×' },
    { id: '6', ruleId: 'JOINT_STRENGTH', description: 'Joint type vs load requirement', status: 'PASS', margin: '2.2×' },
    { id: '7', ruleId: 'MATERIAL_COMPAT', description: 'Core/Surface material compatibility', status: 'PASS', margin: '∞' },
  ];
  
  // Panels data from cabinet
  const panels: PanelInfo[] = (cabinet?.panels || []).slice(0, 3).map((p, i) => ({
    id: `PNL-${String(i + 1).padStart(3, '0')}`,
    role: p.role || 'Panel',
    material: 'HPL Oak',
    thickness: `${p.computed?.realThickness || 18}mm`,
    weight: `${((p.finishWidth * p.finishHeight * 0.0008) / 1000).toFixed(1)}kg`,
  }));
  
  // Fittings data
  const fittings: FittingInfo[] = [
    { id: 'HINGE-SALICE-110/0', name: 'Hinge Salice 110°', maxLoad: '10.5kg/door', used: 6 },
    { id: 'BRKT-L-BRACE-120', name: 'L-Bracket 120mm', maxLoad: '18kg', used: 4 },
    { id: 'RAIL-WALL-HEAVY-45', name: 'Wall Rail Heavy', maxLoad: '80kg', used: 2 },
  ];
  
  // const _passCount = rules.filter(r => r.status === 'PASS').length;
  const warnCount = rules.filter(r => r.status === 'WARN').length;
  const criticalElements = warnCount > 0 ? warnCount : 0;
  const minMargin = Math.min(...rules.map(r => parseFloat(r.margin) || Infinity)).toFixed(1);
  
  // Gate decision
  const gateDecision: GateDecision = verdict === 'FAIL' ? 'Rejected' : 'Approved';
  const specState = verdict === 'FAIL' ? 'DRAFT' : 'RELEASED';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Safety & Gate — {jobId}</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Snapshot {snapshotId} • {machine} {profile}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={gateDecision === 'Approved' ? 'approved' : 'pending'}>
              Gate {gateDecision}
            </Badge>
            <Badge variant="released">specState: {specState}</Badge>
            <button className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors">
              ← Back to Job
            </button>
          </div>
        </div>
      </header>
      
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 border-r border-zinc-800 min-h-[calc(100vh-73px)]">
          <div className="p-4">
            <button className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-6">
              <span>←</span> BACK TO JOB
            </button>
            
            <div className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Safety & Gate</div>
            
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                    ${activeNav === item.id 
                      ? 'bg-zinc-800 text-white border border-zinc-700' 
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>
        
        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="max-w-5xl">
            {/* Safety Overview Card */}
            <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <SectionHeader title="Safety Overview" />
                  <p className="text-sm text-zinc-500">
                    {verdict === 'PASS' 
                      ? 'All structural checks passed for this snapshot.' 
                      : 'Some checks require attention.'}
                  </p>
                </div>
                <Badge variant={verdict === 'PASS' ? 'pass' : verdict === 'WARN' ? 'warn' : 'fail'}>
                  Verdict: {verdict}
                </Badge>
              </div>
              
              <div className="grid grid-cols-3 gap-8 mb-6">
                <StatCard 
                  label="Min Safety Margin" 
                  value={`${minMargin}×`}
                  description={`${panels[0]?.role || 'Panel'}, span ${cabinet?.dimensions?.width || 600}mm.`}
                />
                <StatCard 
                  label="Rules Checked" 
                  value={String(rules.length)}
                  description="Load, span, hinges, etc."
                />
                <StatCard 
                  label="Critical Elements" 
                  value={String(criticalElements)}
                  description={criticalElements > 0 ? `${warnCount} warnings` : 'All above 1.9× margin.'}
                />
              </div>
              
              <div className="flex gap-3">
                <button className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors">
                  Highlight Critical Panels
                </button>
                <button className="px-4 py-2 bg-zinc-800 text-white border border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
                  Open in Workspace
                </button>
              </div>
            </div>
            
            {/* Rules Table */}
            <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6 mb-6">
              <SectionHeader title="Rules" engine="IIMOS Safety v1.0" />
              
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                    <th className="pb-3 font-medium">Rule ID</th>
                    <th className="pb-3 font-medium">Description</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Margin</th>
                    <th className="pb-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-t border-zinc-800/50">
                      <td className="py-3 font-mono text-zinc-300">{rule.ruleId}</td>
                      <td className="py-3 text-zinc-400">{rule.description}</td>
                      <td className="py-3">
                        <Badge variant={rule.status.toLowerCase() as any}>{rule.status}</Badge>
                      </td>
                      <td className="py-3 text-zinc-300">{rule.margin}</td>
                      <td className="py-3">
                        <button className="text-emerald-400 hover:text-emerald-300 text-sm">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Panels & Fittings */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Panels */}
              <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
                <SectionHeader title="Panels" />
                <ul className="space-y-2">
                  {panels.map((panel) => (
                    <li key={panel.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full bg-zinc-600" />
                      <span className="font-mono text-zinc-400">{panel.id}</span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-300">{panel.role}</span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-400">{panel.material} {panel.thickness}</span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-400">{panel.weight}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Fittings */}
              <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
                <SectionHeader title="Fittings" />
                <ul className="space-y-2">
                  {fittings.map((fitting) => (
                    <li key={fitting.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full bg-zinc-600" />
                      <span className="font-mono text-zinc-400">{fitting.id}</span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-400">max {fitting.maxLoad}</span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-300">used: {fitting.used}×</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </main>
        
        {/* Right Sidebar - Gate Decision */}
        <aside className="w-72 border-l border-zinc-800 p-6">
          {/* Gate Decision */}
          <div className="mb-8">
            <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-4">Gate Decision</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Status</span>
                <Badge variant={gateDecision === 'Approved' ? 'approved' : 'pending'}>{gateDecision}</Badge>
              </div>
              
              <div>
                <div className="text-xs text-zinc-500 mb-1">Machine</div>
                <div className="text-sm text-white">{machine}</div>
              </div>
              
              <div>
                <div className="text-xs text-zinc-500 mb-1">Profile</div>
                <div className="text-sm text-white">{profile}</div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Compatibility</span>
                <span className="text-sm text-emerald-400">OK</span>
              </div>
              
              <div className="pt-3 border-t border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Last action</div>
                <div className="text-sm text-zinc-300">
                  Approved by <span className="text-white">Factory Eng. A</span> on 2025-12-26 14:32
                </div>
              </div>
            </div>
          </div>
          
          {/* Export Integrity */}
          <div>
            <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-4">Export Integrity</h3>
            
            <div className="space-y-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Snapshot</div>
                <div className="text-sm font-mono text-white">{snapshotId}</div>
              </div>
              
              <div>
                <div className="text-xs text-zinc-500 mb-1">Bundle Hash</div>
                <div className="text-sm font-mono text-zinc-400 truncate">sha256:7f83b1657f1...a349</div>
              </div>
              
              <div>
                <div className="text-xs text-zinc-500 mb-2">Signatures</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-zinc-300">System Signature</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-zinc-300">Gate Signature (Factory A)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-zinc-300">Export Pack Signature</span>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 space-y-2">
                <button className="w-full px-4 py-2.5 bg-zinc-800 text-white border border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
                  Download DXF + CSV
                </button>
                <button className="w-full px-4 py-2.5 bg-zinc-800/50 text-zinc-300 border border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors">
                  Download Manifest.json
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default SafetyGatePage;
