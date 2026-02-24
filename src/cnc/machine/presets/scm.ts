/**
 * scm.ts - SCM/Morbidelli CNC Machine Profile
 *
 * SCM Morbidelli series — Italian-made CNC machining center.
 * Uses XXL dialect (Xilog Plus native format).
 *
 * @version 1.1.0 - Phase T028-P4: Updated to native XXL (Xilog) format
 */

import type { MachineProfile } from '../machineProfile';

export const SCM_MACHINE: MachineProfile = {
  id: 'SCM',
  name: 'SCM Morbidelli M200',
  description: 'SCM Morbidelli 5-axis CNC — Xilog Plus XXL format',
  manufacturer: 'SCM Group',
  units: 'mm',
  coordinateSystem: 'Y_UP',
  dialect: 'XXL',
  supportsToolChange: true,
  toolMagazineSize: 14,

  axis: {
    x: { min: 0, max: 3100 },
    y: { min: 0, max: 1300 },
    z: { min: -70, max: 130 },
  },

  spindle: {
    minRpm: 1000,
    maxRpm: 24000,
    defaultRpm: 14000,
  },

  defaultSafeZ: 18,

  tools: [
    {
      toolId: 'DRILL_5',
      type: 'DRILL',
      diameter: 5,
      maxDepth: 35,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2300,
      defaultPlungeRate: 1100,
    },
    {
      toolId: 'DRILL_8',
      type: 'DRILL',
      diameter: 8,
      maxDepth: 45,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2100,
      defaultPlungeRate: 950,
    },
    {
      toolId: 'DRILL_10',
      type: 'DRILL',
      diameter: 10,
      maxDepth: 55,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1900,
      defaultPlungeRate: 850,
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
      defaultFeedRate: 950,
      defaultPlungeRate: 380,
    },
    {
      toolId: 'ROUTER_6',
      type: 'ROUTER',
      diameter: 6,
      maxDepth: 28,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 4200,
      defaultPlungeRate: 1700,
    },
    {
      toolId: 'ROUTER_8',
      type: 'ROUTER',
      diameter: 8,
      maxDepth: 35,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 3800,
      defaultPlungeRate: 1400,
    },
    {
      toolId: 'ROUTER_12',
      type: 'ROUTER',
      diameter: 12,
      maxDepth: 42,
      supportsPeck: false,
      supportsBore: false,
      defaultFeedRate: 3200,
      defaultPlungeRate: 1200,
    },
  ],
};

export default SCM_MACHINE;
