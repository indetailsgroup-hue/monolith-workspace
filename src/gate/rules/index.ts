/**
 * Gate Rules Index
 */

export { ruleCutSizeNonNegative } from './rule_cutSize_nonNegative';
export { ruleEdgeAllowance } from './rule_edge_allowance';
export { ruleMinMargins } from './rule_minMargins';
export { ruleClearanceBackPanel } from './rule_clearance_backPanel';
export { ruleDrillDepthSafety } from './rule_drillDepthSafety';
export { ruleEdgeBoreCentering } from './rule_edgeBoreCentering';
export { ruleFittingSpacing } from './rule_fitting_spacing';

// Connector validation rules
export * from './connectors';

// G4: Geometry Safety Gate
export {
  ruleG4_OdBudget,
  ruleG4_PanelOverlap,
  ruleG4_EdgeFeasibility,
  runG4Rules,
  type G4Policy,
} from './gateG4_geometry';

// G11: Minifix/System32/Dowel Validation
export {
  ruleG11_DistanceB,
  ruleG11_DowelDepth,
  ruleG11_DrillType,
  ruleG11_MatingAlignment,
  runG11Rules,
  validateG11FromDrillMap,
  G11_CONSTANTS,
  type G11Issue,
  type G11Policy,
  type G11Result,
  type G11DrillPoint,
  type G11Panel,
} from './gateG11_minifixSystem32';

// G11 Types (re-export for convenience)
export {
  getExpectedBoreType,
  getExpectedDowelDepth,
  isSidePanel,
  isHorizontalPanel,
  calculateExpectedConnectorCount,
} from './gateG11_types';

// G11 Connector OS Audit (catalog + placer + compiler as auditor)
export {
  runConnectorOsAudit,
  groupJoints,
  positionsAlongJoint,
  type ConnectorAuditIssue,
  type ConnectorAuditResult,
} from './gateG11_connectorAudit';

// G12: Curved Panel Manufacturability
export {
  ruleG12_RadiusBelowMin,
  ruleG12_KerfSpacingTooTight,
  ruleG12_KerfDepthUnsafe,
  ruleG12_FittingInKerfZone,
  ruleG12_MaterialDataMissing,
  ruleG12_SlotEdgeInsufficient,
  ruleG12_SlotPairMismatch,
  ruleG12_SlotOverlapsKerf,
  ruleG12_SCurveTransitionShort,
  ruleG12_GrainParallelToBend,
  runG12Rules,
  DEFAULT_G12_POLICY,
  type G12Policy,
  type G12Input,
  type G12PanelInput,
  type G12PatternInput,
  type G12DrillPoint,
  type G12SlotInput,
} from './gateG12_curveManufacturability';
