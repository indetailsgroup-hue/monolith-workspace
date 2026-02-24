/**
 * Machine Presets Index
 *
 * @version 1.4.0 - Added HOMAG, SCM, GENERIC presets
 */

export { KDT_MACHINE } from './kdt';
export { BIESSE_MACHINE } from './biesse';
export { HOMAG_MACHINE } from './homag';
export { SCM_MACHINE } from './scm';
export { GENERIC_MACHINE } from './generic';

import { KDT_MACHINE } from './kdt';
import { BIESSE_MACHINE } from './biesse';
import { HOMAG_MACHINE } from './homag';
import { SCM_MACHINE } from './scm';
import { GENERIC_MACHINE } from './generic';
import type { MachineProfile, MachineId } from '../machineProfile';

/**
 * All available machine presets
 */
export const MACHINE_PRESETS: Record<MachineId, MachineProfile | undefined> = {
  KDT: KDT_MACHINE,
  BIESSE: BIESSE_MACHINE,
  HOMAG: HOMAG_MACHINE,
  SCM: SCM_MACHINE,
  GENERIC: GENERIC_MACHINE,
};

/**
 * Get machine profile by ID
 */
export function getMachineProfile(id: MachineId): MachineProfile | undefined {
  return MACHINE_PRESETS[id];
}

/**
 * Get all available machine IDs
 */
export function getAvailableMachineIds(): MachineId[] {
  return Object.entries(MACHINE_PRESETS)
    .filter(([_, profile]) => profile !== undefined)
    .map(([id]) => id as MachineId);
}

/**
 * Get all available machine profiles
 */
export function getAllMachinePresets(): MachineProfile[] {
  return Object.values(MACHINE_PRESETS).filter(
    (profile): profile is MachineProfile => profile !== undefined
  );
}
