/**
 * Designer Intent Types
 *
 * Types for designer intent to manufacturing plan mapping.
 */

export type PanelId = string;

export interface RuleEffect {
  type: string;
  panelId: PanelId;
  operation?: string;
  parameters?: Record<string, unknown>;
  severity?: string;
  messageTH?: string;
}

export interface DrillOpPDF {
  drillType: string;
  diameter: number;
  depth: number;
  panelId?: PanelId;
  /** Alias used in symbolic drill ops (panelId passed as 'panel') */
  panel?: PanelId;
  face?: string;
  notesTH?: string;
  symbolRef?: string;
}

export interface DrillingPlanPDF {
  operations: DrillOpPDF[];
  warnings?: string[];
  notesTH?: string[];
  system32?: {
    firstHole: number;
    pitch: number;
  };
}

export interface DesignerIntentPDF {
  cabinetId: string;
  rules: RuleEffect[];
  metadata?: Record<string, unknown>;
  shelf?: {
    enabled: boolean;
    supportType?: 'ADJUSTABLE' | 'FIXED';
    count?: number;
  };
  backPanel?: boolean;
  door?: {
    enabled: boolean;
    doorCount?: number;
    doorHeight?: number;
  };
  drawer?: {
    enabled: boolean;
    drawerCount?: number;
  };
}
