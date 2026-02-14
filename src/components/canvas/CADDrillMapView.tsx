/**
 * CADDrillMapView - Professional 2D CAD Drawing
 *
 * Displays cabinet panels in standard architectural CAD format:
 * - Grid lines with axis labels (A, B, C... and 1, 2, 3...)
 * - Title block on right side
 * - Dimension lines with arrows
 * - Drill hole positions with coordinates
 * - Drawing number and scale
 *
 * Based on Thai architectural drawing standards (SC Asset style).
 *
 * @version 3.0.0 - Professional CAD Layout
 */

import React, { useMemo } from 'react';
import type { DrillMap, DrillMapPanel, DrillMapPoint } from '../../core/manufacturing/drillMap/types';

// ============================================
// CONSTANTS
// ============================================

const COLORS = {
  line: '#000000',
  grid: '#000000',
  text: '#000000',
  dimension: '#000000',
  titleBlock: '#000000',
  background: '#ffffff',
};

const TITLE_BLOCK_WIDTH = 180;
const GRID_LABEL_SIZE = 24;

// ============================================
// TYPES
// ============================================

interface CADDrillMapViewProps {
  /** Drill map data */
  drillMap: DrillMap | null;
  /** Selected panel ID */
  selectedPanelId?: string | null;
  /** Panel index to display */
  panelIndex?: number;
  /** Component width in pixels */
  width?: number;
  /** Component height in pixels */
  height?: number;
  /** Background color */
  backgroundColor?: string;
  /** Project name */
  projectName?: string;
  /** Drawing number */
  drawingNumber?: string;
  /** Scale string */
  scaleText?: string;
  /** Show hole coordinates */
  showCoordinates?: boolean;
  /** Show panel labels */
  showLabels?: boolean;
  /** Show dimensions */
  showDimensions?: boolean;
  /** Show callouts */
  showCallouts?: boolean;
  /** Show edge profile */
  showEdgeProfile?: boolean;
}

// ============================================
// GRID AXIS LABELS
// ============================================

const VERTICAL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const HORIZONTAL_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// ============================================
// HELPER COMPONENTS
// ============================================

interface GridLabelProps {
  x: number;
  y: number;
  label: string;
  size?: number;
}

function GridLabel({ x, y, label, size = GRID_LABEL_SIZE }: GridLabelProps) {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={size / 2}
        fill="none"
        stroke={COLORS.grid}
        strokeWidth={1}
      />
      <text
        x={x}
        y={y}
        fill={COLORS.text}
        fontSize={size * 0.5}
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </g>
  );
}

interface DimensionLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  value: number;
  offset?: number;
  vertical?: boolean;
}

function DimensionLine({ x1, y1, x2, y2, value, offset = 15, vertical = false }: DimensionLineProps) {
  const arrowSize = 3;

  let lineX1 = x1, lineY1 = y1, lineX2 = x2, lineY2 = y2;
  let textX, textY;

  if (vertical) {
    lineX1 = x1 - offset;
    lineX2 = x2 - offset;
    textX = lineX1 - 8;
    textY = (y1 + y2) / 2;
  } else {
    lineY1 = y1 - offset;
    lineY2 = y2 - offset;
    textX = (x1 + x2) / 2;
    textY = lineY1 - 4;
  }

  // Extension lines
  const ext1 = vertical
    ? { x1, y1, x2: lineX1 - 3, y2: y1 }
    : { x1, y1, x2: x1, y2: lineY1 - 3 };
  const ext2 = vertical
    ? { x1: x2, y1: y2, x2: lineX2 - 3, y2: y2 }
    : { x1: x2, y1: y2, x2: x2, y2: lineY2 - 3 };

  return (
    <g className="dimension-line">
      {/* Extension lines */}
      <line {...ext1} stroke={COLORS.dimension} strokeWidth={0.3} />
      <line {...ext2} stroke={COLORS.dimension} strokeWidth={0.3} />

      {/* Main line */}
      <line
        x1={lineX1}
        y1={lineY1}
        x2={lineX2}
        y2={lineY2}
        stroke={COLORS.dimension}
        strokeWidth={0.3}
      />

      {/* Arrows */}
      {vertical ? (
        <>
          <polygon
            points={`${lineX1},${lineY1} ${lineX1-arrowSize},${lineY1+arrowSize*2} ${lineX1+arrowSize},${lineY1+arrowSize*2}`}
            fill={COLORS.dimension}
          />
          <polygon
            points={`${lineX2},${lineY2} ${lineX2-arrowSize},${lineY2-arrowSize*2} ${lineX2+arrowSize},${lineY2-arrowSize*2}`}
            fill={COLORS.dimension}
          />
        </>
      ) : (
        <>
          <polygon
            points={`${lineX1},${lineY1} ${lineX1+arrowSize*2},${lineY1-arrowSize} ${lineX1+arrowSize*2},${lineY1+arrowSize}`}
            fill={COLORS.dimension}
          />
          <polygon
            points={`${lineX2},${lineY2} ${lineX2-arrowSize*2},${lineY2-arrowSize} ${lineX2-arrowSize*2},${lineY2+arrowSize}`}
            fill={COLORS.dimension}
          />
        </>
      )}

      {/* Value text */}
      <text
        x={textX}
        y={textY}
        fill={COLORS.text}
        fontSize="8"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        dominantBaseline={vertical ? "middle" : "auto"}
        transform={vertical ? `rotate(-90, ${textX}, ${textY})` : undefined}
      >
        {value.toFixed(value % 1 === 0 ? 0 : 2)}
      </text>
    </g>
  );
}

interface TitleBlockProps {
  x: number;
  y: number;
  width: number;
  height: number;
  projectName: string;
  drawingTitle: string;
  drawingNumber: string;
  scale: string;
}

function TitleBlock({ x, y, width, height, projectName, drawingTitle, drawingNumber, scale }: TitleBlockProps) {
  const rowHeight = height / 8;

  return (
    <g className="title-block">
      {/* Main border */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke={COLORS.titleBlock}
        strokeWidth={1}
      />

      {/* Header */}
      <rect
        x={x}
        y={y}
        width={width}
        height={rowHeight * 2}
        fill="none"
        stroke={COLORS.titleBlock}
        strokeWidth={0.5}
      />
      <text
        x={x + width / 2}
        y={y + rowHeight}
        fill={COLORS.text}
        fontSize="9"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        dominantBaseline="middle"
        fontWeight="bold"
      >
        Drill Map
      </text>
      <text
        x={x + width / 2}
        y={y + rowHeight * 1.7}
        fill={COLORS.text}
        fontSize="7"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        Manufacturing Drawing
      </text>

      {/* Project name row */}
      <line x1={x} y1={y + rowHeight * 2} x2={x + width} y2={y + rowHeight * 2} stroke={COLORS.titleBlock} strokeWidth={0.5} />
      <text
        x={x + 5}
        y={y + rowHeight * 2.3}
        fill={COLORS.text}
        fontSize="6"
        fontFamily="Arial, sans-serif"
      >
        PROJECT:
      </text>
      <text
        x={x + width / 2}
        y={y + rowHeight * 2.8}
        fill={COLORS.text}
        fontSize="8"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        fontWeight="bold"
      >
        {projectName}
      </text>

      {/* Drawing title row */}
      <line x1={x} y1={y + rowHeight * 3.5} x2={x + width} y2={y + rowHeight * 3.5} stroke={COLORS.titleBlock} strokeWidth={0.5} />
      <text
        x={x + 5}
        y={y + rowHeight * 3.8}
        fill={COLORS.text}
        fontSize="6"
        fontFamily="Arial, sans-serif"
      >
        TITLE:
      </text>
      <text
        x={x + width / 2}
        y={y + rowHeight * 4.5}
        fill={COLORS.text}
        fontSize="10"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        fontWeight="bold"
      >
        {drawingTitle}
      </text>

      {/* Drawing number and scale */}
      <line x1={x} y1={y + rowHeight * 5.5} x2={x + width} y2={y + rowHeight * 5.5} stroke={COLORS.titleBlock} strokeWidth={0.5} />
      <line x1={x + width / 2} y1={y + rowHeight * 5.5} x2={x + width / 2} y2={y + height} stroke={COLORS.titleBlock} strokeWidth={0.5} />

      <text
        x={x + 5}
        y={y + rowHeight * 5.8}
        fill={COLORS.text}
        fontSize="6"
        fontFamily="Arial, sans-serif"
      >
        DWG NO:
      </text>
      <text
        x={x + width / 4}
        y={y + rowHeight * 6.8}
        fill={COLORS.text}
        fontSize="12"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        fontWeight="bold"
      >
        {drawingNumber}
      </text>

      <text
        x={x + width / 2 + 5}
        y={y + rowHeight * 5.8}
        fill={COLORS.text}
        fontSize="6"
        fontFamily="Arial, sans-serif"
      >
        SCALE:
      </text>
      <text
        x={x + width * 3 / 4}
        y={y + rowHeight * 6.8}
        fill={COLORS.text}
        fontSize="12"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        fontWeight="bold"
      >
        {scale}
      </text>
    </g>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function CADDrillMapView({
  drillMap,
  selectedPanelId,
  panelIndex = 0,
  width = 1000,
  height = 700,
  backgroundColor = '#ffffff',
  projectName = 'Cabinet Project',
  drawingNumber = 'DM-01',
  scaleText = '1:10',
}: CADDrillMapViewProps) {
  // Get panel to display
  const panel = useMemo(() => {
    if (!drillMap || drillMap.panels.length === 0) return null;

    if (selectedPanelId) {
      return drillMap.panels.find(p => p.panelId === selectedPanelId) || drillMap.panels[0];
    }

    return drillMap.panels[panelIndex] || drillMap.panels[0];
  }, [drillMap, selectedPanelId, panelIndex]);

  // Calculate layout
  const layout = useMemo(() => {
    if (!panel) return null;

    const panelWidth = panel.dimensions.width;
    const panelHeight = panel.dimensions.height;

    // Margins for grid labels and dimensions
    const margin = { top: 80, right: TITLE_BLOCK_WIDTH + 40, bottom: 60, left: 60 };

    // Calculate scale to fit
    const availableWidth = width - margin.left - margin.right;
    const availableHeight = height - margin.top - margin.bottom;
    const scale = Math.min(
      availableWidth / panelWidth,
      availableHeight / panelHeight,
      0.8
    );

    const scaledWidth = panelWidth * scale;
    const scaledHeight = panelHeight * scale;

    // Center the drawing
    const offsetX = margin.left + (availableWidth - scaledWidth) / 2;
    const offsetY = margin.top + (availableHeight - scaledHeight) / 2;

    return {
      panelWidth,
      panelHeight,
      scaledWidth,
      scaledHeight,
      offsetX,
      offsetY,
      scale,
      margin,
    };
  }, [panel, width, height]);

  if (!panel || !layout) {
    return (
      <div
        style={{ width, height, backgroundColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span style={{ color: '#666' }}>No drill map data</span>
      </div>
    );
  }

  const { panelWidth, panelHeight, scaledWidth, scaledHeight, offsetX, offsetY, scale } = layout;

  // Transform panel coordinates to SVG coordinates
  const toSvgX = (x: number) => offsetX + x * scale;
  const toSvgY = (y: number) => offsetY + scaledHeight - y * scale; // Flip Y

  // Grid intervals (every 100mm or so, adjusted based on panel size)
  const gridInterval = panelWidth > 500 ? 200 : 100;
  const verticalGridLines = Math.ceil(panelHeight / gridInterval);
  const horizontalGridLines = Math.ceil(panelWidth / gridInterval);

  return (
    <svg
      width={width}
      height={height}
      style={{ backgroundColor }}
      className="cad-drill-map-view"
    >
      {/* Main border */}
      <rect
        x={5}
        y={5}
        width={width - 10}
        height={height - 10}
        fill="none"
        stroke={COLORS.line}
        strokeWidth={1}
      />

      {/* Drawing title at top */}
      <text
        x={width / 2 - TITLE_BLOCK_WIDTH / 2}
        y={30}
        fill={COLORS.text}
        fontSize="14"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        fontWeight="bold"
      >
        {panel.role.replace('_', ' ')} - Drill Pattern
      </text>

      {/* Grid labels - vertical (A, B, C...) on right side */}
      {Array.from({ length: Math.min(verticalGridLines + 1, VERTICAL_LABELS.length) }).map((_, i) => {
        const y = toSvgY(i * gridInterval);
        if (y < offsetY || y > offsetY + scaledHeight) return null;

        return (
          <g key={`v-label-${i}`}>
            {/* Label on right */}
            <GridLabel
              x={offsetX + scaledWidth + 30}
              y={y}
              label={VERTICAL_LABELS[i] || `${i + 1}`}
            />
            {/* Dashed grid line */}
            <line
              x1={offsetX}
              y1={y}
              x2={offsetX + scaledWidth}
              y2={y}
              stroke={COLORS.grid}
              strokeWidth={0.3}
              strokeDasharray="5,3"
            />
          </g>
        );
      })}

      {/* Grid labels - horizontal (1, 2, 3...) on bottom */}
      {Array.from({ length: Math.min(horizontalGridLines + 1, HORIZONTAL_LABELS.length) }).map((_, i) => {
        const x = toSvgX(i * gridInterval);
        if (x < offsetX || x > offsetX + scaledWidth) return null;

        return (
          <g key={`h-label-${i}`}>
            {/* Label on bottom */}
            <GridLabel
              x={x}
              y={offsetY + scaledHeight + 30}
              label={HORIZONTAL_LABELS[i] || `${i + 1}`}
            />
            {/* Dashed grid line */}
            <line
              x1={x}
              y1={offsetY}
              x2={x}
              y2={offsetY + scaledHeight}
              stroke={COLORS.grid}
              strokeWidth={0.3}
              strokeDasharray="5,3"
            />
          </g>
        );
      })}

      {/* Panel outline */}
      <rect
        x={offsetX}
        y={offsetY}
        width={scaledWidth}
        height={scaledHeight}
        fill="none"
        stroke={COLORS.line}
        strokeWidth={1.5}
      />

      {/* Dimension lines */}
      {/* Width dimension (top) */}
      <DimensionLine
        x1={offsetX}
        y1={offsetY}
        x2={offsetX + scaledWidth}
        y2={offsetY}
        value={panelWidth}
        offset={40}
      />

      {/* Height dimension (left) */}
      <DimensionLine
        x1={offsetX}
        y1={offsetY}
        x2={offsetX}
        y2={offsetY + scaledHeight}
        value={panelHeight}
        offset={40}
        vertical
      />

      {/* Drill holes */}
      {panel.points.map((point, i) => {
        const x = toSvgX(point.position[0]);
        const y = toSvgY(point.position[1]);
        const r = Math.max((point.diameter * scale) / 2, 2.5);

        return (
          <g key={`hole-${i}`}>
            {/* Hole circle */}
            <circle
              cx={x}
              cy={y}
              r={r}
              fill="none"
              stroke={COLORS.line}
              strokeWidth={0.8}
            />
            {/* Center mark */}
            <line x1={x - r * 0.5} y1={y} x2={x + r * 0.5} y2={y} stroke={COLORS.line} strokeWidth={0.3} />
            <line x1={x} y1={y - r * 0.5} x2={x} y2={y + r * 0.5} stroke={COLORS.line} strokeWidth={0.3} />

            {/* Coordinate label */}
            <text
              x={x + r + 3}
              y={y - r - 2}
              fill={COLORS.text}
              fontSize="6"
              fontFamily="Arial, sans-serif"
            >
              ({point.depth},{Math.round(point.position[0])},{Math.round(point.position[1])})
            </text>
          </g>
        );
      })}

      {/* Hole summary */}
      <text
        x={offsetX}
        y={offsetY + scaledHeight + 55}
        fill={COLORS.text}
        fontSize="8"
        fontFamily="Arial, sans-serif"
      >
        Total Holes: {panel.points.length} | Thickness: {panel.dimensions.thickness}mm
      </text>

      {/* Title block */}
      <TitleBlock
        x={width - TITLE_BLOCK_WIDTH - 15}
        y={60}
        width={TITLE_BLOCK_WIDTH}
        height={height - 80}
        projectName={projectName}
        drawingTitle={panel.role.replace('_', ' ')}
        drawingNumber={drawingNumber}
        scale={scaleText}
      />
    </svg>
  );
}

export default CADDrillMapView;
