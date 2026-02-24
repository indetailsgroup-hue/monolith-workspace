/**
 * kdt.ts - KDT CNC Machine Profile
 *
 * KDT (Kundig) - Common CNC router for cabinet manufacturing
 *
 * @version 1.0.0 - Phase D1
 */

import type { StrictMachineProfile } from '../machineProfile';

export const KDT_MACHINE: StrictMachineProfile = {
  id: 'KDT',
  name: 'KDT NC Router',
  manufacturer: 'KDT Machinery',
  units: 'mm',
  coordinateSystem: 'Y_UP',
  dialect: 'FANUC',
  supportsToolChange: true,
  toolMagazineSize: 12,

  axis: {
    x: { min: 0, max: 3200 },
    y: { min: 0, max: 1300 },
    z: { min: -50, max: 100 },
  },

  spindle: {
    minRpm: 6000,
    maxRpm: 18000,
    defaultRpm: 12000,
  },

  defaultSafeZ: 15,

  tools: [
    // Drill bits
    {
      toolId: 'DRILL_5',
      type: 'DRILL',
      diameter: 5,
      maxDepth: 30,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2000,
      defaultPlungeRate: 1000,
    },
    {
      toolId: 'DRILL_8',
      type: 'DRILL',
      diameter: 8,
      maxDepth: 40,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1800,
      defaultPlungeRate: 800,
    },
    {
      toolId: 'DRILL_10',
      type: 'DRILL',
      diameter: 10,
      maxDepth: 50,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1500,
      defaultPlungeRate: 700,
    },

    // Boring bits (for Minifix cam housing)
    {
      toolId: 'BORE_15',
      type: 'BORE',
      diameter: 15,
      maxDepth: 13,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 1200,
      defaultPlungeRate: 500,
    },
    {
      toolId: 'BORE_20',
      type: 'BORE',
      diameter: 20,
      maxDepth: 15,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 1000,
      defaultPlungeRate: 400,
    },
    {
      toolId: 'BORE_35',
      type: 'BORE',
      diameter: 35,
      maxDepth: 13,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 800,
      defaultPlungeRate: 300,
    },

    // Router bits
    {
      toolId: 'ROUTER_6',
      type: 'ROUTER',
      diameter: 6,
      maxDepth: 25,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 4000,
      defaultPlungeRate: 1500,
    },
    {
      toolId: 'ROUTER_8',
      type: 'ROUTER',
      diameter: 8,
      maxDepth: 30,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 3500,
      defaultPlungeRate: 1200,
    },
    {
      toolId: 'ROUTER_12',
      type: 'ROUTER',
      diameter: 12,
      maxDepth: 40,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 3000,
      defaultPlungeRate: 1000,
    },
  ],
};

export default KDT_MACHINE;
