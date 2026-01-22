/**
 * Machine Presets Index
 *
 * @version 1.0.0 - Phase D1
 */

export { KDT_MACHINE } from './kdt';
export { BIESSE_MACHINE } from './biesse';

import { KDT_MACHINE } from './kdt';
import { BIESSE_MACHINE } from './biesse';
import type { MachineProfile, MachineId } from '../machineProfile';

/**
 * All available machine presets
 */
export const MACHINE_PRESETS: Record<MachineId, MachineProfile | undefined> = {
  KDT: KDT_MACHINE,
  BIESSE: BIESSE_MACHINE,
  HOMAG: undefined,
  SCM: undefined,
  GENERIC: undefined,
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
