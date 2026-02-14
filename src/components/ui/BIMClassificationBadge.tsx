/**
 * BIMClassificationBadge - Display OmniClass and Uniclass codes
 *
 * Features:
 * - Auto-updates based on cabinet category
 * - Shows both OmniClass (North America) and Uniclass (UK/International)
 * - Expandable for detailed classification tree
 */

import React, { useState } from 'react';
import {
  getBIMCodes,
  OMNICLASS_CODES,
  UNICLASS_CODES,
  type CabinetCategory,
  type OmniClassCode,
  type UniclassCode,
} from '../../core/catalog/CabinetTaxonomy';
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
import { Info, ChevronDown, ChevronUp, Building2, Globe, Copy, Check } from 'lucide-react';

interface BIMClassificationBadgeProps {
  category?: CabinetCategory;
  compact?: boolean;
  showDetails?: boolean;
}

function CodeBadge({
  code,
  type,
  color,
}: {
  code: OmniClassCode | UniclassCode;
  type: 'omniclass' | 'uniclass';
  color: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code.number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`p-2.5 rounded-lg bg-surface-2 border border-[#333] ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {type === 'omniclass' ? (
            <Building2 size={12} className="text-blue-400" />
          ) : (
            <Globe size={12} className="text-green-400" />
          )}
          <span className="text-xs text-gray-400">
            {type === 'omniclass' ? 'OmniClass' : 'Uniclass'}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-surface-3 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <Check size={10} className="text-green-400" />
          ) : (
            <Copy size={10} className="text-gray-500 hover:text-white" />
          )}
        </button>
      </div>
      <div className="text-sm font-mono text-white">
        {code.number}
      </div>
      <div className="text-xs text-gray-500 mt-0.5 truncate">
        {code.title}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#333] last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs text-white ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export function BIMClassificationBadge({
  category: controlledCategory,
  compact = false,
  showDetails: initialShowDetails = false,
}: BIMClassificationBadgeProps) {
  const [showDetails, setShowDetails] = useState(initialShowDetails);

  // Get cabinet from store if no category provided
  const cabinet = useCabinet();

  // Determine category - use controlled prop or derive from cabinet type
  const getCategory = (): CabinetCategory => {
    if (controlledCategory) return controlledCategory;

    // Derive from cabinet type
    const cabinetType = cabinet?.type || 'BASE';
    if (cabinetType.startsWith('BASE')) return 'BASE';
    if (cabinetType.startsWith('WALL')) return 'WALL';
    if (cabinetType.startsWith('TALL')) return 'TALL';
    if (cabinetType.startsWith('CORNER')) return 'CORNER';
    if (cabinetType.startsWith('APPLIANCE')) return 'APPLIANCE';
    return 'BASE';
  };

  const category = getCategory();
  const bimCodes = getBIMCodes(category);

  if (compact) {
    return (
      <div className="flex gap-2 text-xs">
        <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 rounded border border-blue-500/20">
          <Building2 size={10} className="text-blue-400" />
          <span className="font-mono text-blue-400">{bimCodes.omniclass.number.split(' ')[0]}</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded border border-green-500/20">
          <Globe size={10} className="text-green-400" />
          <span className="font-mono text-green-400">{bimCodes.uniclass.number}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Info size={14} className="text-purple-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-white">BIM Classification</div>
            <div className="text-xs text-gray-500">
              {category} Cabinet
            </div>
          </div>
        </div>
        <div className="text-gray-500">
          {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Code Badges */}
      <div className="grid grid-cols-2 gap-2">
        <CodeBadge
          code={bimCodes.omniclass}
          type="omniclass"
          color="hover:border-blue-500/40"
        />
        <CodeBadge
          code={bimCodes.uniclass}
          type="uniclass"
          color="hover:border-green-500/40"
        />
      </div>

      {/* Expanded Details */}
      {showDetails && (
        <div className="p-3 bg-surface-2 rounded-lg border border-[#333] space-y-3">
          {/* OmniClass Details */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Building2 size={12} className="text-blue-400" />
              <span className="text-xs font-medium text-white">OmniClass (North America)</span>
            </div>
            <div className="pl-4 space-y-0">
              <DetailRow label="Table" value={bimCodes.omniclass.table} mono />
              <DetailRow label="Number" value={bimCodes.omniclass.number} mono />
              <DetailRow label="Title" value={bimCodes.omniclass.title} />
            </div>
          </div>

          <div className="h-px bg-[#333]" />

          {/* Uniclass Details */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={12} className="text-green-400" />
              <span className="text-xs font-medium text-white">Uniclass 2015 (UK/Intl)</span>
            </div>
            <div className="pl-4 space-y-0">
              <DetailRow label="Table" value={bimCodes.uniclass.table} mono />
              <DetailRow label="Number" value={bimCodes.uniclass.number} mono />
              <DetailRow label="Title" value={bimCodes.uniclass.title} />
            </div>
          </div>

          {/* Reference Links */}
          <div className="pt-2 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <span>References:</span>
              <a
                href="https://www.omniclass.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                OmniClass
              </a>
              <span>|</span>
              <a
                href="https://www.thenbs.com/our-tools/uniclass-2015"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:underline"
              >
                Uniclass
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BIMClassificationBadge;
