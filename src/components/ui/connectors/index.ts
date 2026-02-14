/**
 * Connectors Configuration Module
 *
 * Unified connector configuration system for cabinet hardware:
 * - MinifixConfigPanel: S200 bolt & cam housing configuration (Häfele)
 * - HingeConfigPanel: European hinge configuration (Blum, Hettich, Grass)
 * - ShelfPinConfigPanel: System 32 shelf pin drilling pattern
 * - DowelConfigPanel: Wood dowel joint configuration
 * - ConnectorManager: Tabbed interface combining all panels
 *
 * @version 1.1.0 - Added MinifixConfigPanel integration
 */

// Main connector manager
export {
  ConnectorManager,
  DEFAULT_CONNECTOR_MANAGER_CONFIG,
  type ConnectorManagerConfig,
  type ConnectorType,
} from './ConnectorManager';

// Minifix config (re-exported from parent for convenience)
export {
  MinifixConfigPanel,
  DEFAULT_MINIFIX_CONFIG,
  CAM_SPECS_BY_WOOD_THICKNESS,
  getMinifixConfigForThickness,
  type MinifixFullConfig,
} from '../MinifixConfigPanel';

// Individual config panels
export {
  HingeConfigPanel,
  DEFAULT_HINGE_CONFIG,
  type HingeConfig,
} from './HingeConfigPanel';

export {
  ShelfPinConfigPanel,
  DEFAULT_SHELF_PIN_CONFIG,
  type ShelfPinConfig,
} from './ShelfPinConfigPanel';

export {
  DowelConfigPanel,
  DEFAULT_DOWEL_CONFIG,
  type DowelConfig,
} from './DowelConfigPanel';
