/**
 * biesse.ts - Biesse CNC Machine Profile
 *
 * Biesse Rover - High-end CNC machining center
 *
 * @version 1.0.0 - Phase D1
 */

import type { MachineProfile } from '../machineProfile';

export const BIESSE_MACHINE: MachineProfile = {
  id: 'BIESSE',
  name: 'Biesse Rover B FT',
  manufacturer: 'Biesse Group',
  units: 'mm',
  coordinateSystem: 'Y_UP',
  dialect: 'BIESSE',
  supportsToolChange: true,
  toolMagazineSize: 18,

  axis: {
    x: { min: 0, max: 3700 },
    y: { min: 0, max: 1400 },
    z: { min: -80, max: 150 },
  },

  spindle: {
    minRpm: 1000,
    maxRpm: 24000,
    defaultRpm: 15000,
  },

  defaultSafeZ: 20,

  tools: [
    // Drill bits
    {
      toolId: 'DRILL_5',
      type: 'DRILL',
      diameter: 5,
      maxDepth: 35,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2500,
      defaultPlungeRate: 1200,
    },
    {
      toolId: 'DRILL_8',
      type: 'DRILL',
      diameter: 8,
      maxDepth: 50,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2200,
      defaultPlungeRate: 1000,
    },
    {
      toolId: 'DRILL_10',
      type: 'DRILL',
      diameter: 10,
      maxDepth: 60,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2000,
      defaultPlungeRate: 900,
    },

    // Boring bits (for Minifix cam housing)
    {
      toolId: 'BORE_15',
      type: 'BORE',
      diameter: 15,
      maxDepth: 15,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 1500,
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

    // Router bits
    {
      toolId: 'ROUTER_6',
      type: 'ROUTER',
      diameter: 6,
      maxDepth: 30,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 5000,
      defaultPlungeRate: 2000,
    },
    {
      toolId: 'ROUTER_8',
      type: 'ROUTER',
      diameter: 8,
      maxDepth: 35,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 4500,
      defaultPlungeRate: 1800,
    },
    {
      toolId: 'ROUTER_12',
      type: 'ROUTER',
      diameter: 12,
      maxDepth: 45,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 4000,
      defaultPlungeRate: 1500,
    },
    {
      toolId: 'ROUTER_16',
      type: 'ROUTER',
      diameter: 16,
      maxDepth: 50,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 3500,
      defaultPlungeRate: 1200,
    },
  ],
};

export default BIESSE_MACHINE;
