/**
 * VerifiedCutListView - Display cut list from verified factory packet
 *
 * Features:
 * - Displays cut list rows with dimensions
 * - Material grouping
 * - Edge banding indicators
 * - Grain direction display
 * - Search and filter
 *
 * @version 1.0.0 - Phase C: Factory Ingest & Verify
 */

import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  Layers,
  FileSpreadsheet,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { PacketCutList, PacketCutListRow } from '../packet/types';

// ============================================
// TYPES
// ============================================

export interface VerifiedCutListViewProps {
  /** Cut list data from verified packet */
  cutList: PacketCutList;
  /** Title to display */
  title?: string;
  /** Show summary stats */
  showSummary?: boolean;
  /** Enable search */
  enableSearch?: boolean;
  /** Group by material */
  groupByMaterial?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

type SortField = 'rowNo' | 'partId' | 'finishW' | 'finishH' | 'materialId' | 'qty';
type SortDir = 'asc' | 'desc';

// ============================================
// STYLES
// ============================================

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: 300,
  padding: '8px 12px 8px 36px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
};

const tableContainerStyle: React.CSSProperties = {
  overflowX: 'auto',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.03)',
  color: 'rgba(255,255,255,0.7)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  color: '#fff',
};

const groupHeaderStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'rgba(139,92,246,0.1)',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
};

const summaryCardStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 12,
};

const statBoxStyle: React.CSSProperties = {
  padding: 12,
  background: 'rgba(255,255,255,0.03)',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  textAlign: 'center',
};

const edgeBandingCellStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  fontSize: 10,
  fontFamily: 'monospace',
};

const edgeBandingBadgeStyle = (hasEdge: boolean): React.CSSProperties => ({
  width: 18,
  height: 18,
  borderRadius: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: hasEdge ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
  color: hasEdge ? '#22c55e' : 'rgba(255,255,255,0.3)',
});

// ============================================
// COMPONENT
// ============================================

export function VerifiedCutListView({
  cutList,
  title = 'Cut List',
  showSummary = true,
  enableSearch = true,
  groupByMaterial = false,
  compact = false,
  className = '',
}: VerifiedCutListViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('rowNo');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // Filter and sort rows
  const filteredRows = useMemo(() => {
    let rows = [...cutList.rows];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.partId.toLowerCase().includes(query) ||
          row.materialId.toLowerCase().includes(query) ||
          row.note?.toLowerCase().includes(query)
      );
    }

    // Sort
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'rowNo':
          cmp = a.rowNo - b.rowNo;
          break;
        case 'partId':
          cmp = a.partId.localeCompare(b.partId);
          break;
        case 'finishW':
          cmp = a.finishW - b.finishW;
          break;
        case 'finishH':
          cmp = a.finishH - b.finishH;
          break;
        case 'materialId':
          cmp = a.materialId.localeCompare(b.materialId);
          break;
        case 'qty':
          cmp = a.qty - b.qty;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [cutList.rows, searchQuery, sortField, sortDir]);

  // Group rows by material
  const groupedRows = useMemo(() => {
    if (!groupByMaterial) return null;

    const groups: Record<string, PacketCutListRow[]> = {};
    for (const row of filteredRows) {
      if (!groups[row.materialId]) {
        groups[row.materialId] = [];
      }
      groups[row.materialId].push(row);
    }
    return groups;
  }, [filteredRows, groupByMaterial]);

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Toggle group collapse
  const toggleGroup = (materialId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) {
        next.delete(materialId);
      } else {
        next.add(materialId);
      }
      return next;
    });
  };

  // Copy to clipboard as TSV
  const handleCopy = () => {
    const headers = [
      'Row',
      'Part ID',
      'Material',
      'Qty',
      'Width',
      'Height',
      'Cut W',
      'Cut H',
      'Grain',
      'Edgeband',
    ];
    const lines = [headers.join('\t')];

    for (const row of filteredRows) {
      const edgeBand = row.edgeBanding.map((e) => (e > 0 ? e : '-')).join('/');
      lines.push(
        [
          row.rowNo,
          row.partId,
          row.materialId,
          row.qty,
          row.finishW,
          row.finishH,
          row.cutW,
          row.cutH,
          row.grain,
          edgeBand,
        ].join('\t')
      );
    }

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return (
      <span style={{ marginLeft: 4, opacity: 0.7 }}>
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Render edge banding cell
  const renderEdgeBanding = (edgeBanding: [number, number, number, number]) => {
    const [L, R, T, B] = edgeBanding;
    return (
      <div style={edgeBandingCellStyle}>
        <div style={edgeBandingBadgeStyle(L > 0)} title={`Left: ${L}mm`}>
          L
        </div>
        <div style={edgeBandingBadgeStyle(R > 0)} title={`Right: ${R}mm`}>
          R
        </div>
        <div style={edgeBandingBadgeStyle(T > 0)} title={`Top: ${T}mm`}>
          T
        </div>
        <div style={edgeBandingBadgeStyle(B > 0)} title={`Bottom: ${B}mm`}>
          B
        </div>
      </div>
    );
  };

  // Render grain icon
  const renderGrain = (grain: string) => {
    const icon =
      grain === 'HORIZONTAL' ? '→' : grain === 'VERTICAL' ? '↓' : '○';
    const color =
      grain === 'NONE' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)';
    return <span style={{ color }}>{icon}</span>;
  };

  // Render table row
  const renderRow = (row: PacketCutListRow) => (
    <tr key={row.partId + row.rowNo}>
      <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.5)', width: 50 }}>
        {row.rowNo}
      </td>
      <td style={tdStyle}>{row.partId}</td>
      {!groupByMaterial && (
        <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.6)' }}>
          {row.materialId}
        </td>
      )}
      <td style={{ ...tdStyle, textAlign: 'center' }}>{row.qty}</td>
      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{row.finishW}</td>
      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{row.finishH}</td>
      {!compact && (
        <>
          <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>
            {row.cutW}
          </td>
          <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>
            {row.cutH}
          </td>
          <td style={{ ...tdStyle, textAlign: 'center' }}>
            {renderGrain(row.grain)}
          </td>
          <td style={tdStyle}>{renderEdgeBanding(row.edgeBanding)}</td>
        </>
      )}
    </tr>
  );

  return (
    <div style={containerStyle} className={className}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileSpreadsheet size={20} style={{ color: '#8b5cf6' }} />
          <span style={{ fontWeight: 500, color: '#fff' }}>{title}</span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            ({cutList.summary.totalRows} rows, {cutList.summary.totalParts} parts)
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Search */}
          {enableSearch && (
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.4)',
                }}
              />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={searchInputStyle}
              />
            </div>
          )}

          {/* Copy */}
          <button
            onClick={handleCopy}
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: copied ? '#22c55e' : 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Summary */}
      {showSummary && (
        <div style={summaryCardStyle}>
          <div style={statBoxStyle}>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#8b5cf6' }}>
              {cutList.summary.totalRows}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              Rows
            </div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#22c55e' }}>
              {cutList.summary.totalParts}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              Total Parts
            </div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#f59e0b' }}>
              {Object.keys(cutList.summary.byMaterial).length}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              Materials
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th
                style={{ ...thStyle, cursor: 'pointer' }}
                onClick={() => handleSort('rowNo')}
              >
                # {renderSortIndicator('rowNo')}
              </th>
              <th
                style={{ ...thStyle, cursor: 'pointer' }}
                onClick={() => handleSort('partId')}
              >
                Part ID {renderSortIndicator('partId')}
              </th>
              {!groupByMaterial && (
                <th
                  style={{ ...thStyle, cursor: 'pointer' }}
                  onClick={() => handleSort('materialId')}
                >
                  Material {renderSortIndicator('materialId')}
                </th>
              )}
              <th
                style={{ ...thStyle, cursor: 'pointer', textAlign: 'center' }}
                onClick={() => handleSort('qty')}
              >
                Qty {renderSortIndicator('qty')}
              </th>
              <th
                style={{ ...thStyle, cursor: 'pointer' }}
                onClick={() => handleSort('finishW')}
              >
                Width {renderSortIndicator('finishW')}
              </th>
              <th
                style={{ ...thStyle, cursor: 'pointer' }}
                onClick={() => handleSort('finishH')}
              >
                Height {renderSortIndicator('finishH')}
              </th>
              {!compact && (
                <>
                  <th style={thStyle}>Cut W</th>
                  <th style={thStyle}>Cut H</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Grain</th>
                  <th style={thStyle}>Edge Band</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {groupedRows
              ? Object.entries(groupedRows).map(([materialId, rows]) => (
                  <React.Fragment key={materialId}>
                    {/* Group Header */}
                    <tr>
                      <td
                        colSpan={compact ? 6 : 10}
                        style={{ padding: 0 }}
                      >
                        <div
                          style={groupHeaderStyle}
                          onClick={() => toggleGroup(materialId)}
                        >
                          {collapsedGroups.has(materialId) ? (
                            <ChevronRight size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                          <Layers size={14} />
                          <span>{materialId}</span>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                            ({rows.length} rows)
                          </span>
                        </div>
                      </td>
                    </tr>
                    {/* Group Rows */}
                    {!collapsedGroups.has(materialId) && rows.map(renderRow)}
                  </React.Fragment>
                ))
              : filteredRows.map(renderRow)}
          </tbody>
        </table>

        {/* Empty State */}
        {filteredRows.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            {searchQuery
              ? `No parts matching "${searchQuery}"`
              : 'No parts in cut list'}
          </div>
        )}
      </div>
    </div>
  );
}

export default VerifiedCutListView;
