/**
 * generic.ts - Generic CNC Machine Profile
 *
 * Universal fallback profile for standard CNC routers.
 * Uses FANUC dialect (ISO 6983 standard G-code).
 * Conservative axis limits and tool selection for broad compatibility.
 *
 * @version 1.0.0 - Phase T028: Multi-Machine Export
 */

import type { MachineProfile } from '../machineProfile';

export const GENERIC_MACHINE: MachineProfile = {
  id: 'GENERIC',
  name: 'Generic CNC Router',
  description: 'Universal fallback profile for standard ISO G-code output',
  manufacturer: 'Generic',
  units: 'mm',
  coordinateSystem: 'Y_UP',
  dialect: 'FANUC',
  supportsToolChange: true,
  toolMagazineSize: 8,

  axis: {
    x: { min: 0, max: 2500 },
    y: { min: 0, max: 1300 },
    z: { min: -60, max: 100 },
  },

  spindle: {
    minRpm: 3000,
    maxRpm: 18000,
    defaultRpm: 12000,
  },

  defaultSafeZ: 15,

  tools: [
    {
      toolId: 'DRILL_5',
      type: 'DRILL',
      diameter: 5,
      maxDepth: 30,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1800,
      defaultPlungeRate: 900,
    },
    {
      toolId: 'DRILL_8',
      type: 'DRILL',
      diameter: 8,
      maxDepth: 40,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1600,
      defaultPlungeRate: 800,
    },
    {
      toolId: 'DRILL_10',
      type: 'DRILL',
      diameter: 10,
      maxDepth: 50,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1400,
      defaultPlungeRate: 700,
    },
    {
      toolId: 'BORE_15',
      type: 'BORE',
      diameter: 15,
      maxDepth: 15,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 1000,
      defaultPlungeRate: 500,
    },
    {
      toolId: 'BORE_20',
      type: 'BORE',
      diameter: 20,
      maxDepth: 18,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 900,
      defaultPlungeRate: 400,
    },
    {
      toolId: 'BORE_35',
      type: 'BORE',
      diameter: 35,
      maxDepth: 15,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 700,
      defaultPlungeRate: 300,
    },
    {
      toolId: 'ROUTER_6',
      type: 'ROUTER',
      diameter: 6,
      maxDepth: 25,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 3000,
      defaultPlungeRate: 1200,
    },
  ],
};

export default GENERIC_MACHINE;
