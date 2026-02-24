/**
 * homag.ts - Homag/Weeke CNC Machine Profile
 *
 * Homag CENTATEQ series — high-performance CNC machining center.
 * Uses MPR dialect (native WoodWOP format).
 *
 * @version 1.1.0 - Phase T028-P2: MPR native format
 */

import type { MachineProfile } from '../machineProfile';

export const HOMAG_MACHINE: MachineProfile = {
  id: 'HOMAG',
  name: 'Homag CENTATEQ P-110',
  description: 'Homag CENTATEQ processing center with native WoodWOP MPR format',
  manufacturer: 'Homag Group',
  units: 'mm',
  coordinateSystem: 'Y_UP',
  dialect: 'MPR',
  supportsToolChange: true,
  toolMagazineSize: 16,

  axis: {
    x: { min: 0, max: 3000 },
    y: { min: 0, max: 1500 },
    z: { min: -60, max: 120 },
  },

  spindle: {
    minRpm: 1000,
    maxRpm: 24000,
    defaultRpm: 15000,
  },

  defaultSafeZ: 20,

  tools: [
    {
      toolId: 'DRILL_5',
      type: 'DRILL',
      diameter: 5,
      maxDepth: 35,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2200,
      defaultPlungeRate: 1100,
    },
    {
      toolId: 'DRILL_8',
      type: 'DRILL',
      diameter: 8,
      maxDepth: 50,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2000,
      defaultPlungeRate: 1000,
    },
    {
      toolId: 'DRILL_10',
      type: 'DRILL',
      diameter: 10,
      maxDepth: 60,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1800,
      defaultPlungeRate: 800,
    },
    {
      toolId: 'BORE_15',
      type: 'BORE',
      diameter: 15,
      maxDepth: 15,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 1400,
      defaultPlungeRate: 600,
    },
    {
      toolId: 'BORE_20',
      type: 'BORE',
      diameter: 20,
      maxDepth: 18,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 1200,
      defaultPlungeRate: 500,
    },
    {
      toolId: 'BORE_35',
      type: 'BORE',
      diameter: 35,
      maxDepth: 15,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 1000,
      defaultPlungeRate: 400,
    },
    {
      toolId: 'ROUTER_6',
      type: 'ROUTER',
      diameter: 6,
      maxDepth: 30,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 4500,
      defaultPlungeRate: 1800,
    },
    {
      toolId: 'ROUTER_8',
      type: 'ROUTER',
      diameter: 8,
      maxDepth: 35,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 4000,
      defaultPlungeRate: 1500,
    },
    {
      toolId: 'ROUTER_12',
      type: 'ROUTER',
      diameter: 12,
      maxDepth: 45,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 3500,
      defaultPlungeRate: 1200,
    },
  ],
};

export default HOMAG_MACHINE;
