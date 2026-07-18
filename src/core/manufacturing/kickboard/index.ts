/**
 * index.ts - Kickboard (Plinth) Manufacturing Module
 *
 * Pure geometry helpers for the KICKBOARD panel that closes the toe-kick void.
 * Panel generation itself lives in generatePanels (useCabinetStore) so the
 * kickboard is costed by the same computePanel closure as the carcass roles.
 *
 * @version 1.0.0 - Initial plinth implementation
 */

export {
  // Functions
  computeKickboardSize,
  computeKickboardFrontZ,
  computeKickboardZ,
  shouldGenerateKickboard,
  resolveKickboardSetback,
  resolveKickboardSetbackDatum,

  // Constants
  DEFAULT_KICK_SETBACK,

  // Types
  type KickboardSize,
  type KickboardDimensionsInput,
  type KickboardStructureInput,
} from './kickboardGeometry';
