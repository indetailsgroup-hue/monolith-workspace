/**
 * qcAnomalyTypes.ts
 * Type definitions for the QC Anomaly Detection module (MONOLITH v18.0)
 * ENTERPRISE plan gate required for all access.
 */

import type { OrgPlan } from '../tenant/types';

// ─── Enums ───────────────────────────────────────────────────────────────────

export type QcaThresholdType = 'MIN' | 'MAX' | 'RANGE' | 'ZSCORE';

export type QcaMetricKey =
  | 'DEFECT_RATE'
  | 'CYCLE_TIME'
  | 'YIELD_RATE'
  | 'SCRAP_RATE'
  | 'REWORK_RATE'
  | 'DOWNTIME'
  | 'CUSTOM';

export type QcaAnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type QcaAnomalyStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

// ─── DB Row Types ─────────────────────────────────────────────────────────────

export interface QcaThresholdConfigRow {
  id: string;
  org_id: string;
  metric_key: QcaMetricKey;
  threshold_type: QcaThresholdType;
  min_value: number | null;
  max_value: number | null;
  zscore_threshold: number | null;
  is_active: boolean;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QcaMeasurementRow {
  id: string;
  org_id: string;
  metric_key: QcaMetricKey;
  value: number;
  measured_at: string;
  source: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface QcaAnomalyEventRow {
  id: string;
  org_id: string;
  metric_key: QcaMetricKey;
  measurement_id: string;
  threshold_id: string;
  severity: QcaAnomalySeverity;
  status: QcaAnomalyStatus;
  measured_value: number;
  threshold_breach_detail: Record<string, unknown>;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface QcaAnomalySummaryRow {
  org_id: string;
  metric_key: QcaMetricKey;
  open_count: number;
  acknowledged_count: number;
  resolved_count: number;
  last_open_anomaly_at: string | null;
  last_anomaly_at: string | null;
}

// ─── App-Layer Types (mirrors DB rows) ───────────────────────────────────────

export type QcaThresholdConfig = QcaThresholdConfigRow;
export type QcaMeasurement     = QcaMeasurementRow;
export type QcaAnomalyEvent    = QcaAnomalyEventRow;
export type QcaAnomalySummary  = QcaAnomalySummaryRow;

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateQcaThresholdPayload {
  org_id: string;
  metric_key: QcaMetricKey;
  threshold_type: QcaThresholdType;
  min_value?: number | null;
  max_value?: number | null;
  zscore_threshold?: number | null;
  is_active?: boolean;
  description?: string | null;
}

export interface UpdateQcaThresholdPayload {
  threshold_type?: QcaThresholdType;
  min_value?: number | null;
  max_value?: number | null;
  zscore_threshold?: number | null;
  is_active?: boolean;
  description?: string | null;
}

export interface SubmitQcaMeasurementPayload {
  org_id: string;
  metric_key: QcaMetricKey;
  value: number;
  measured_at?: string;
  source?: string | null;
  notes?: string | null;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export interface QcaFilters {
  metricKey: QcaMetricKey | 'ALL';
  severity: QcaAnomalySeverity | 'ALL';
  status: QcaAnomalyStatus | 'ALL';
}

export const DEFAULT_QCA_FILTERS: QcaFilters = {
  metricKey: 'ALL',
  severity: 'ALL',
  status: 'OPEN',
};

// ─── Plan Gate ────────────────────────────────────────────────────────────────

export const canAccessQcAnomaly = (orgPlan: OrgPlan): boolean =>
  orgPlan === 'ENTERPRISE';

export class QcAnomalyPlanGateError extends Error {
  constructor() {
    super('QC Anomaly Detection requires an ENTERPRISE plan.');
    this.name = 'QcAnomalyPlanGateError';
  }
}

// ─── Thai Label Constants ─────────────────────────────────────────────────────

export const QCA_THRESHOLD_TYPE_LABEL_TH: Record<QcaThresholdType, string> = {
  MIN:    'ค่าต่ำสุด',
  MAX:    'ค่าสูงสุด',
  RANGE:  'ช่วงค่า',
  ZSCORE: 'Z-Score',
};

export const QCA_METRIC_KEY_LABEL_TH: Record<QcaMetricKey, string> = {
  DEFECT_RATE: 'อัตราของเสีย',
  CYCLE_TIME:  'เวลาวงจรการผลิต',
  YIELD_RATE:  'อัตราผลิตภัณฑ์ดี',
  SCRAP_RATE:  'อัตราเศษซาก',
  REWORK_RATE: 'อัตราแก้งาน',
  DOWNTIME:    'เวลาหยุดเครื่อง',
  CUSTOM:      'กำหนดเอง',
};

export const QCA_ANOMALY_SEVERITY_LABEL_TH: Record<QcaAnomalySeverity, string> = {
  LOW:      'ต่ำ',
  MEDIUM:   'ปานกลาง',
  HIGH:     'สูง',
  CRITICAL: 'วิกฤต',
};

export const QCA_ANOMALY_STATUS_LABEL_TH: Record<QcaAnomalyStatus, string> = {
  OPEN:         'เปิด',
  ACKNOWLEDGED: 'รับทราบแล้ว',
  RESOLVED:     'แก้ไขแล้ว',
};

// ─── Label Getters ────────────────────────────────────────────────────────────

export const getQcaThresholdTypeLabel = (type: QcaThresholdType): string =>
  QCA_THRESHOLD_TYPE_LABEL_TH[type];

export const getQcaMetricKeyLabel = (key: QcaMetricKey): string =>
  QCA_METRIC_KEY_LABEL_TH[key];

export const getQcaAnomalySeverityLabel = (severity: QcaAnomalySeverity): string =>
  QCA_ANOMALY_SEVERITY_LABEL_TH[severity];

export const getQcaAnomalyStatusLabel = (status: QcaAnomalyStatus): string =>
  QCA_ANOMALY_STATUS_LABEL_TH[status];

// ─── Row Mappers ──────────────────────────────────────────────────────────────

export const mapQcaThresholdConfigRow = (row: QcaThresholdConfigRow): QcaThresholdConfig =>
  row;

export const mapQcaMeasurementRow = (row: QcaMeasurementRow): QcaMeasurement =>
  row;

export const mapQcaAnomalyEventRow = (row: QcaAnomalyEventRow): QcaAnomalyEvent =>
  row;

export const mapQcaAnomalySummaryRow = (row: QcaAnomalySummaryRow): QcaAnomalySummary =>
  row;
