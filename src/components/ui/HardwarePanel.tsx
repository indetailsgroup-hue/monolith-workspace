/**
 * HardwarePanel - Hardware & Fitting System
 *
 * Manages cabinet hardware placement:
 * - Connectors (Minifix, Dowels, Confirmat)
 * - Hinges (Blum, Hettich, etc.)
 * - Drawer systems (Tandembox, ArciTech)
 * - Shelf supports
 * - Handles & knobs
 * - Lighting
 *
 * Includes Hardware Library for preset configuration and
 * Catalog for browsing/adding hardware items.
 *
 * v1.1: Added Hardware Library integration with Minifix S200 config
 */

import React, { useState, lazy, Suspense } from 'react';
import { ConnectorManager } from './connectors';
import { Package, ShoppingCart, Wrench } from 'lucide-react';
import { ModalLoadingFallback } from './LoadingFallback';

// Lazy load heavy component (T018 code splitting)
const HardwareLibraryPanel = lazy(() =>
  import('./HardwareLibrary').then(m => ({ default: m.HardwareLibraryPanel }))
);
// import { useCabinetStore } from '../../core/store/useCabinetStore';

// Hardware catalog types
interface HardwareItem {
  id: string;
  name: string;
  brand: string;
  category: 'hinge' | 'drawer' | 'shelf_support' | 'handle' | 'lighting' | 'other';
  specifications: {
    openingAngle?: number;
    loadCapacity?: number;
    length?: number;
    softClose?: boolean;
  };
  price: number;
  icon: string;
}

// Sample hardware catalog
const HARDWARE_CATALOG: HardwareItem[] = [
  // Hinges
  { id: 'blum-clip-110', name: 'Clip-Top 110°', brand: 'Blum', category: 'hinge', specifications: { openingAngle: 110, softClose: true }, price: 180, icon: '🔗' },
  { id: 'blum-clip-170', name: 'Clip-Top 170°', brand: 'Blum', category: 'hinge', specifications: { openingAngle: 170, softClose: true }, price: 280, icon: '🔗' },
  { id: 'hettich-sensys', name: 'Sensys 110°', brand: 'Hettich', category: 'hinge', specifications: { openingAngle: 110, softClose: true }, price: 165, icon: '🔗' },
  { id: 'grass-tiomos', name: 'Tiomos 110°', brand: 'Grass', category: 'hinge', specifications: { openingAngle: 110, softClose: true }, price: 155, icon: '🔗' },
  
  // Drawer systems
  { id: 'blum-tandem-400', name: 'Tandembox 400mm', brand: 'Blum', category: 'drawer', specifications: { length: 400, loadCapacity: 30, softClose: true }, price: 850, icon: '📥' },
  { id: 'blum-tandem-500', name: 'Tandembox 500mm', brand: 'Blum', category: 'drawer', specifications: { length: 500, loadCapacity: 30, softClose: true }, price: 920, icon: '📥' },
  { id: 'blum-legrabox-500', name: 'Legrabox 500mm', brand: 'Blum', category: 'drawer', specifications: { length: 500, loadCapacity: 40, softClose: true }, price: 1450, icon: '📥' },
  { id: 'hettich-arcitech-500', name: 'ArciTech 500mm', brand: 'Hettich', category: 'drawer', specifications: { length: 500, loadCapacity: 40, softClose: true }, price: 1380, icon: '📥' },
  
  // Shelf supports
  { id: 'shelf-pin-5mm', name: '5mm Pin Support', brand: 'Generic', category: 'shelf_support', specifications: { loadCapacity: 15 }, price: 5, icon: '📍' },
  { id: 'shelf-bracket-adj', name: 'Adjustable Bracket', brand: 'Häfele', category: 'shelf_support', specifications: { loadCapacity: 25 }, price: 45, icon: '📍' },
  { id: 'shelf-invisible', name: 'Invisible Support', brand: 'Häfele', category: 'shelf_support', specifications: { loadCapacity: 20 }, price: 85, icon: '📍' },
  
  // Handles
  { id: 'handle-bar-160', name: 'Bar Handle 160mm', brand: 'Generic', category: 'handle', specifications: { length: 160 }, price: 120, icon: '🚪' },
  { id: 'handle-bar-320', name: 'Bar Handle 320mm', brand: 'Generic', category: 'handle', specifications: { length: 320 }, price: 180, icon: '🚪' },
  { id: 'handle-knob', name: 'Round Knob 35mm', brand: 'Generic', category: 'handle', specifications: { length: 35 }, price: 65, icon: '⚫' },
  
  // Lighting
  { id: 'led-strip-warm', name: 'LED Strip Warm', brand: 'Häfele', category: 'lighting', specifications: {}, price: 450, icon: '💡' },
  { id: 'led-spot', name: 'LED Spot 3W', brand: 'Häfele', category: 'lighting', specifications: {}, price: 280, icon: '💡' },
];

// Section Component
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border-b border-zinc-800">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-sm font-medium text-zinc-300">{title}</span>
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

// Hardware Item Card
function HardwareCard({ item, onAdd }: { item: HardwareItem; onAdd: (item: HardwareItem) => void }) {
  return (
    <div 
      className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-700/50 cursor-pointer transition-colors group"
      onClick={() => onAdd(item)}
    >
      <div className="w-10 h-10 rounded-lg bg-zinc-700/50 flex items-center justify-center text-xl">
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-200 truncate">{item.name}</div>
        <div className="text-xs text-zinc-500">{item.brand}</div>
      </div>
      <div className="text-right">
        <div className="text-xs text-emerald-400">฿{item.price}</div>
        <button className="text-xs text-zinc-500 group-hover:text-emerald-400 transition-colors">
          + Add
        </button>
      </div>
    </div>
  );
}

// Installed Hardware Item
interface InstalledHardware extends HardwareItem {
  instanceId: string;
  position?: { x: number; y: number; z: number };
  quantity: number;
}

// ============================================
// TAB TYPES
// ============================================

type HardwareTab = 'library' | 'catalog' | 'connectors';

// ============================================
// CATALOG VIEW COMPONENT
// ============================================

function CatalogView() {
  const [installedHardware, setInstalledHardware] = useState<InstalledHardware[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter hardware by category
  const categories = [
    { id: 'hinge', name: 'Hinges', items: HARDWARE_CATALOG.filter((h) => h.category === 'hinge') },
    { id: 'drawer', name: 'Drawer Systems', items: HARDWARE_CATALOG.filter((h) => h.category === 'drawer') },
    { id: 'shelf_support', name: 'Shelf Supports', items: HARDWARE_CATALOG.filter((h) => h.category === 'shelf_support') },
    { id: 'handle', name: 'Handles & Knobs', items: HARDWARE_CATALOG.filter((h) => h.category === 'handle') },
    { id: 'lighting', name: 'Lighting', items: HARDWARE_CATALOG.filter((h) => h.category === 'lighting') },
  ];

  // Filter by search
  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.brand.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((cat) => cat.items.length > 0);

  const handleAddHardware = (item: HardwareItem) => {
    // Check if already installed
    const existing = installedHardware.find((h) => h.id === item.id);
    if (existing) {
      setInstalledHardware((prev) => prev.map((h) => (h.id === item.id ? { ...h, quantity: h.quantity + 1 } : h)));
    } else {
      setInstalledHardware((prev) => [
        ...prev,
        {
          ...item,
          instanceId: `${item.id}-${Date.now()}`,
          quantity: 1,
        },
      ]);
    }
  };

  const handleRemoveHardware = (instanceId: string) => {
    setInstalledHardware((prev) => prev.filter((h) => h.instanceId !== instanceId));
  };

  // Calculate total cost
  const totalCost = installedHardware.reduce((sum, h) => sum + h.price * h.quantity, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="p-2 border-b border-[#333]">
        <input
          type="text"
          placeholder="Search hardware..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface-2 border border-[#444] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
        />
      </div>

      {/* Installed Hardware Summary */}
      {installedHardware.length > 0 && (
        <div className="p-2 bg-surface-2/50 border-b border-[#333]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-gray-300">Installed Hardware</span>
            <span className="text-[10px] text-green-400">฿{totalCost.toLocaleString()}</span>
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {installedHardware.map((h) => (
              <div key={h.instanceId} className="flex items-center justify-between text-[10px]">
                <span className="text-gray-400">
                  {h.icon} {h.name} ×{h.quantity}
                </span>
                <button onClick={() => handleRemoveHardware(h.instanceId)} className="text-red-400 hover:text-red-300">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hardware Catalog */}
      <div className="flex-1 overflow-y-auto">
        {filteredCategories.map((category) => (
          <Section key={category.id} title={category.name} defaultOpen={category.id === 'hinge'}>
            <div className="space-y-2">
              {category.items.map((item) => (
                <HardwareCard key={item.id} item={item} onAdd={handleAddHardware} />
              ))}
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}

// ============================================
// MAIN HARDWARE PANEL
// ============================================

export function HardwarePanel() {
  const [activeTab, setActiveTab] = useState<HardwareTab>('library');

  return (
    <div className="h-full flex flex-col">
      {/* Tab Bar */}
      <div className="flex border-b border-[#333] shrink-0">
        <button
          onClick={() => setActiveTab('library')}
          className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-all flex items-center justify-center gap-1.5 relative ${
            activeTab === 'library' ? 'text-green-400 bg-surface-2' : 'text-gray-500 hover:text-white hover:bg-surface-2/50'
          }`}
        >
          {activeTab === 'library' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />}
          <Package size={12} />
          <span>Library</span>
        </button>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-all flex items-center justify-center gap-1.5 relative ${
            activeTab === 'catalog' ? 'text-green-400 bg-surface-2' : 'text-gray-500 hover:text-white hover:bg-surface-2/50'
          }`}
        >
          {activeTab === 'catalog' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />}
          <ShoppingCart size={12} />
          <span>Catalog</span>
        </button>
        <button
          onClick={() => setActiveTab('connectors')}
          className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-all flex items-center justify-center gap-1.5 relative ${
            activeTab === 'connectors' ? 'text-purple-400 bg-surface-2' : 'text-gray-500 hover:text-white hover:bg-surface-2/50'
          }`}
        >
          {activeTab === 'connectors' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400" />}
          <Wrench size={12} />
          <span>Connectors</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'library' && (
          <Suspense fallback={<ModalLoadingFallback />}>
            <HardwareLibraryPanel />
          </Suspense>
        )}
        {activeTab === 'catalog' && <CatalogView />}
        {activeTab === 'connectors' && <ConnectorManager />}
      </div>
    </div>
  );
}

export default HardwarePanel;
