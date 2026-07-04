/**
 * Hardware Library - Component Specifications & Formulas
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Central repository for hardware specifications
 * - Contains calculation formulas for sizing
 * - Drilling patterns for CNC operations
 * 
 * CATEGORIES:
 * - Drawer Systems (slides, runners)
 * - Hinges (concealed, piano, pivot)
 * - Connectors (cam locks, dowels, confirmats)
 * - Door Styles (shaker, slab, raised panel)
 * - Shelf Supports (pins, brackets)
 */

// ============================================
// DRAWER SYSTEMS
// ============================================

export const DRAWER_SYSTEMS = {
  
  /**
   * Metropush Undermount (Push-to-Open)
   * Popular soft-close drawer system
   */
  metropush: {
    id: 'metropush',
    name: 'Metropush Undermount (Push-to-Open)',
    brand: 'Generic',
    type: 'undermount',
    
    // Sizing Rules
    rules: {
      /**
       * Calculate drawer box width
       * Box width = Cabinet inner width - 41mm (20.5mm per side)
       */
      box_width_formula: (cabinetInnerW: number): number => cabinetInnerW - 41,
      
      /**
       * Minimum cabinet depth for given slide length
       * Cabinet depth ≥ slide length + 18mm
       */
      min_cabinet_depth: (slideLength: number): number => slideLength + 18,
      
      /**
       * Available slide lengths
       */
      slide_lengths: [250, 300, 350, 400, 450, 500, 550],
      
      /**
       * Max load capacity (kg)
       */
      load_capacity: 40,
    },
    
    // Drilling pattern for cabinet sides
    drilling: {
      slide_mount_y: 37,        // mm from bottom
      hole_dia: 5,              // mm
      hole_depth: 13,           // mm
      holes_per_slide: 3,       // front, middle, back
      hole_spacing: 32,         // mm (System 32 compatible)
    },
    
    // Drawer box requirements
    drawer_box: {
      min_side_height: 68,      // mm
      back_height_reduction: 15, // mm less than sides
      bottom_thickness: 6,       // mm (MDF/plywood)
      bottom_groove_depth: 8,    // mm
      bottom_groove_offset: 12,  // mm from bottom edge
    },
  },
  
  /**
   * Blum Tandem Plus
   * Premium soft-close runner
   */
  blum_tandem: {
    id: 'blum_tandem',
    name: 'Blum Tandem Plus Blumotion',
    brand: 'Blum',
    type: 'undermount',
    
    rules: {
      box_width_formula: (cabinetInnerW: number): number => cabinetInnerW - 42,
      min_cabinet_depth: (slideLength: number): number => slideLength + 15,
      slide_lengths: [250, 300, 350, 400, 450, 500, 550, 600],
      load_capacity: 50,
    },
    
    drilling: {
      slide_mount_y: 37,
      hole_dia: 5,
      hole_depth: 13,
      holes_per_slide: 4,
      hole_spacing: 32,
    },
    
    drawer_box: {
      min_side_height: 84,
      back_height_reduction: 20,
      bottom_thickness: 8,
      bottom_groove_depth: 10,
      bottom_groove_offset: 10,
    },
  },
  
  /**
   * Side-mounted roller slides
   * Budget option
   */
  side_roller: {
    id: 'side_roller',
    name: 'Side-Mount Roller Slide',
    brand: 'Generic',
    type: 'side_mount',
    
    rules: {
      box_width_formula: (cabinetInnerW: number): number => cabinetInnerW - 25,
      min_cabinet_depth: (slideLength: number): number => slideLength,
      slide_lengths: [250, 300, 350, 400, 450, 500],
      load_capacity: 25,
    },
    
    drilling: {
      slide_mount_y: 45,        // mm from bottom (slide center)
      hole_dia: 4,
      hole_depth: 12,
      holes_per_slide: 2,
      hole_spacing: 64,
    },
    
    drawer_box: {
      min_side_height: 100,
      back_height_reduction: 0,
      bottom_thickness: 6,
      bottom_groove_depth: 8,
      bottom_groove_offset: 12,
    },
  },
};

// ============================================
// HINGES
// ============================================

export const HINGES = {
  
  /**
   * Salice Series B
   * Full overlay concealed hinge
   */
  salice_series_b: {
    id: 'salice_b',
    name: 'Salice Series B (Full Overlay)',
    brand: 'Salice',
    type: 'concealed',
    opening_angle: 110,
    
    // Cup drilling
    cup: {
      diameter: 35,           // mm
      depth: 13,              // mm
      edge_offset: 3,         // mm (K value) from door edge to cup edge
    },
    
    // Plate drilling on cabinet side
    plate: {
      /**
       * Calculate mounting plate distance from edge
       * plate_distance = 37 - overlay
       */
      plate_formula: (k: number, overlay: number): number => 37 - overlay,

      hole_spacing: 32,       // mm between mounting holes
      hole_dia: 5,            // mm
      hole_depth: 13,         // mm
    },
    
    // Door positioning
    positioning: {
      /**
       * Calculate cup center offset from door edge
       * cup_offset = K + 17.5
       */
      cup_offset: (k: number): number => k + 17.5,
      
      /**
       * Standard positions from door top/bottom
       */
      positions_from_edge: [100, 100],  // mm [from_top, from_bottom]
    },
  },
  
  /**
   * Blum Clip Top
   * Soft-close concealed hinge
   */
  blum_clip_top: {
    id: 'blum_clip',
    name: 'Blum Clip Top Blumotion',
    brand: 'Blum',
    type: 'concealed',
    opening_angle: 107,
    
    cup: {
      diameter: 35,
      depth: 13,
      edge_offset: 3,
    },
    
    plate: {
      plate_formula: (k: number, overlay: number): number => 37 - overlay,
      hole_spacing: 32,
      hole_dia: 5,
      hole_depth: 13,
    },
    
    positioning: {
      cup_offset: (k: number): number => k + 21.5,
      positions_from_edge: [100, 100],
    },
  },
  
  /**
   * Piano Hinge
   * Continuous hinge for large doors
   */
  piano_hinge: {
    id: 'piano',
    name: 'Piano Hinge (Continuous)',
    brand: 'Generic',
    type: 'surface_mount',
    opening_angle: 180,
    
    mounting: {
      hole_spacing: 50,       // mm between screw holes
      hole_dia: 4,            // mm
      hole_depth: 15,         // mm
      edge_offset: 15,        // mm from door edge
    },
  },
};

// ============================================
// CONNECTORS
// ============================================

export const CONNECTORS = {
  
  /**
   * Confirmat Screw
   * Most common cabinet fastener
   */
  confirmat: {
    id: 'confirmat_7x50',
    name: 'Confirmat 7×50mm',
    
    drilling: {
      // Face hole (through panel)
      face: {
        diameter: 8,          // mm clearance hole
        depth: 'through',     // goes through
      },
      // Edge hole (receiving panel)
      edge: {
        diameter: 5,          // mm pilot hole
        depth: 50,            // mm
      },
      // Standard offset from edge
      offset: 50,             // mm (System 32)
    },
    
    patterns: {
      // Standard patterns for different panel heights
      small: (height: number) => [height * 0.25, height * 0.75],
      standard: (height: number) => [50, height - 50],
      tall: (height: number) => [50, height / 2, height - 50],
    },
  },
  
  /**
   * Minifix/Cam Lock
   * Knock-down connector
   */
  minifix: {
    id: 'minifix_15',
    name: 'Minifix 15mm Cam Lock',
    
    drilling: {
      // Cam hole (in panel face)
      cam: {
        diameter: 15,         // mm
        depth: 13,            // mm
      },
      // Bolt hole (through same panel)
      bolt_through: {
        diameter: 8,          // mm
        depth: 'through',
      },
      // Dowel hole (receiving panel edge)
      dowel: {
        diameter: 5,          // mm
        depth: 34,            // mm (for 34mm bolt)
      },
      // Cam center from bolt
      cam_offset: 9.5,        // mm from bolt center
    },
    
    patterns: {
      standard: (height: number) => [50, height - 50],
    },
  },
  
  /**
   * Wooden Dowel
   * Traditional joint connector
   */
  dowel: {
    id: 'dowel_8x30',
    name: 'Wooden Dowel 8×30mm',
    
    drilling: {
      diameter: 8,            // mm
      depth: 12,              // mm (each side)
      spacing: 64,            // mm between dowels (2 × System 32)
    },
    
    patterns: {
      standard: (height: number) => [32, height - 32],
      dense: (height: number) => [32, 96, height - 96, height - 32],
    },
  },
};

// ============================================
// DOOR STYLES
// ============================================

export const DOOR_STYLES = {
  
  /**
   * Shaker Modern (Sharp Corner)
   * Clean, contemporary look
   */
  shaker_sharp: {
    id: 'shaker_sharp',
    name: 'Shaker Modern (Sharp Corner)',
    
    params: {
      frame_width: 70,        // mm stile/rail width
      profile_depth: 6,       // mm profile cut depth
      panel_recess: 6,        // mm panel sits behind frame
      corner_type: 'sharp',   // or 'rounded'
    },
    
    // For CNC routing
    routing: {
      profile_tool: 12,       // mm end mill
      passes: 2,              // number of passes
      step_down: 3,           // mm per pass
    },
  },
  
  /**
   * Shaker Traditional
   * Classic look with rounded inner corners
   */
  shaker_traditional: {
    id: 'shaker_trad',
    name: 'Shaker Traditional',
    
    params: {
      frame_width: 75,
      profile_depth: 8,
      panel_recess: 8,
      corner_type: 'rounded',
      corner_radius: 6,       // mm
    },
    
    routing: {
      profile_tool: 12,
      passes: 3,
      step_down: 3,
    },
  },
  
  /**
   * Slab Door
   * Flat, no profile
   */
  slab: {
    id: 'slab',
    name: 'Slab (Flat Panel)',
    
    params: {
      frame_width: 0,
      profile_depth: 0,
      panel_recess: 0,
      corner_type: 'none',
    },
    
    routing: null,            // No routing needed
  },
  
  /**
   * J-Pull (Handleless)
   * Modern handleless design
   */
  j_pull: {
    id: 'j_pull',
    name: 'J-Pull (Handleless)',
    
    params: {
      frame_width: 0,
      profile_depth: 0,
      pull_height: 40,        // mm pull groove height
      pull_depth: 18,         // mm pull groove depth
      pull_position: 'top',   // 'top' or 'bottom'
    },
    
    routing: {
      profile_tool: 6,
      passes: 3,
      step_down: 6,
    },
  },
};

// ============================================
// SHELF SUPPORTS
// ============================================

export const SHELF_SUPPORTS = {
  
  /**
   * System 32 Shelf Pins
   * Standard adjustable shelf system
   */
  system_32_pins: {
    id: 'sys32_pins',
    name: 'System 32 Shelf Pins (5mm)',

    params: {
      hole_spacing: 32,       // mm vertical spacing
      hole_diameter: 5,       // mm
      hole_depth: 13,         // mm
      front_offset: 50,       // mm from front edge
      back_offset: 50,        // mm from back edge
      start_height: 64,       // mm from bottom (first hole)
    },
    
    /**
     * Generate hole positions for panel
     */
    generate_positions: (panelHeight: number, startY = 64, endY?: number): number[] => {
      const positions: number[] = [];
      const end = endY || (panelHeight - 64);
      
      for (let y = startY; y <= end; y += 32) {
        positions.push(y);
      }
      
      return positions;
    },
  },
  
  /**
   * Shelf Brackets
   * For heavy-duty shelving
   */
  brackets: {
    id: 'brackets',
    name: 'Metal Shelf Brackets',
    
    params: {
      hole_spacing: 64,       // mm vertical spacing
      hole_diameter: 6,       // mm
      hole_depth: 15,         // mm
      front_offset: 50,       // mm from front edge
      back_offset: 50,        // mm from back edge
    },
  },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get hinge positions for a door
 */
export const getHingePositions = (
  doorHeight: number, 
  hingeType: keyof typeof HINGES = 'salice_series_b'
): number[] => {
  const hinge = HINGES[hingeType];
  const [fromTop, fromBottom] = (hinge as any).positioning?.positions_from_edge || [100, 100];
  
  if (doorHeight > 1200) {
    // 3 hinges for tall doors
    return [fromTop, doorHeight / 2, doorHeight - fromBottom];
  }
  
  return [fromTop, doorHeight - fromBottom];
};

/**
 * Calculate drawer box dimensions
 */
export const calculateDrawerBox = (
  cabinetInnerWidth: number,
  cabinetInnerHeight: number,
  drawerSystem: keyof typeof DRAWER_SYSTEMS = 'metropush'
): { width: number; height: number; depth: number } => {
  const system = DRAWER_SYSTEMS[drawerSystem];
  
  return {
    width: system.rules.box_width_formula(cabinetInnerWidth),
    height: cabinetInnerHeight - 20,  // Standard gap
    depth: cabinetInnerHeight,        // Match cabinet depth
  };
};

/**
 * Get confirmat positions for panel connection
 */
export const getConfirmatPositions = (panelHeight: number): number[] => {
  if (panelHeight < 300) {
    return CONNECTORS.confirmat.patterns.small(panelHeight);
  }
  if (panelHeight < 800) {
    return CONNECTORS.confirmat.patterns.standard(panelHeight);
  }
  return CONNECTORS.confirmat.patterns.tall(panelHeight);
};
