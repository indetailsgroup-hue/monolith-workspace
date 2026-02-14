/**
 * Designer Intent Rule Engine Tests
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateIntent,
  createDefaultIntentPDF,
  evaluateDesignerIntent,
  checkRequirement,
  getBlockedEffects,
  getWarningEffects,
} from '../index';
import { DEFAULT_DESIGNER_RULES } from '../designerRules.default';
import { hardwareMapper } from '../mappers/hardwareMapper';
import { drillingMapper } from '../mappers/drillingMapper';
import { assemblyMapper } from '../mappers/assemblyMapper';
import type { DesignerIntentPDF } from '../types';

describe('DesignerIntent Rule Engine', () => {
  describe('evaluateIntent', () => {
    it('should evaluate default intent without errors', () => {
      const intent = createDefaultIntentPDF();
      const result = evaluateIntent(intent);

      expect(result).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.effects).toBeDefined();
      expect(result.hardware).toBeDefined();
      expect(result.drilling).toBeDefined();
      expect(result.assembly).toBeDefined();
      expect(result.gate).toBeDefined();
    });

    it('should not block default intent', () => {
      const intent = createDefaultIntentPDF();
      const result = evaluateIntent(intent);

      expect(result.gate.blocked).toBe(false);
      expect(result.gate.blocks).toHaveLength(0);
    });

    it('should trigger COMPOSITION_LEFT_TO_RIGHT for default direction', () => {
      const intent = createDefaultIntentPDF();
      const result = evaluateIntent(intent);

      const compositionEffect = result.effects.find(
        (e) => e.code === 'COMPOSITION_LEFT_TO_RIGHT'
      );
      expect(compositionEffect).toBeDefined();
      expect(compositionEffect?.severity).toBe('info');
    });

    it('should trigger ADJUSTABLE_FOOT_IS_JOINT for default base logic', () => {
      const intent = createDefaultIntentPDF();
      const result = evaluateIntent(intent);

      const footEffect = result.effects.find(
        (e) => e.code === 'ADJUSTABLE_FOOT_IS_JOINT'
      );
      expect(footEffect).toBeDefined();
    });
  });

  describe('Shelf Rules', () => {
    it('should warn about 14mm shelf requiring dedicated slot', () => {
      const intent = createDefaultIntentPDF();
      intent.shelf = {
        enabled: true,
        supportType: 'ADJUSTABLE',
        count: 1,
        thickness: 14,
      };

      const result = evaluateIntent(intent);

      const shelfEffect = result.effects.find(
        (e) => e.code === 'SHELF_14MM_REQUIRES_DEDICATED_SLOT'
      );
      expect(shelfEffect).toBeDefined();
      expect(shelfEffect?.severity).toBe('warn');
    });

    it('should use System 32 for 18mm shelves', () => {
      const intent = createDefaultIntentPDF();
      intent.shelf = {
        enabled: true,
        supportType: 'ADJUSTABLE',
        count: 1,
        thickness: 18,
      };

      const result = evaluateIntent(intent);

      const shelfEffect = result.effects.find(
        (e) => e.code === 'SHELF_18MM_SYSTEM_32'
      );
      expect(shelfEffect).toBeDefined();
      expect(shelfEffect?.severity).toBe('info');
    });

    it('should block shelf span > 800mm without mid support', () => {
      const intent = createDefaultIntentPDF();
      intent.shelf = {
        enabled: true,
        supportType: 'ADJUSTABLE',
        count: 1,
        thickness: 18,
        spanMM: 900,
        midSupport: false,
      };

      const result = evaluateIntent(intent);

      const spanEffect = result.effects.find(
        (e) => e.code === 'SHELF_SPAN_LIMIT'
      );
      expect(spanEffect).toBeDefined();
      expect(spanEffect?.severity).toBe('block');
      expect(result.gate.blocked).toBe(true);
    });
  });

  describe('Drawer Rules', () => {
    it('should warn about Push-Open requiring Sync Bar', () => {
      const intent = createDefaultIntentPDF();
      intent.drawer = {
        enabled: true,
        drawerCount: 1,
        slideType: 'UNDERMOUNT',
        openMechanism: 'PUSH_OPEN',
      };

      const result = evaluateIntent(intent);

      const drawerEffect = result.effects.find(
        (e) => e.code === 'PUSH_OPEN_REQUIRES_SYNC_BAR'
      );
      expect(drawerEffect).toBeDefined();
      expect(drawerEffect?.severity).toBe('warn');
    });

    it('should block drawer front height < 80mm', () => {
      const intent = createDefaultIntentPDF();
      intent.drawer = {
        enabled: true,
        drawerCount: 1,
        slideType: 'UNDERMOUNT',
        frontHeightMM: 60,
      };

      const result = evaluateIntent(intent);

      const heightEffect = result.effects.find(
        (e) => e.code === 'DRAWER_FRONT_MIN_HEIGHT'
      );
      expect(heightEffect).toBeDefined();
      expect(heightEffect?.severity).toBe('block');
      expect(result.gate.blocked).toBe(true);
    });

    it('should select undermount slides for undermount drawer', () => {
      const intent = createDefaultIntentPDF();
      intent.drawer = {
        enabled: true,
        drawerCount: 2,
        slideType: 'UNDERMOUNT',
      };

      const result = evaluateIntent(intent);

      const slideEffect = result.effects.find(
        (e) => e.code === 'UNDERMOUNT_SLIDE_STANDARD'
      );
      expect(slideEffect).toBeDefined();
    });
  });

  describe('Door Rules', () => {
    it('should warn about JET Flap requiring deep shelf', () => {
      const intent = createDefaultIntentPDF();
      intent.door = {
        enabled: true,
        doorType: 'LIFT',
        flapSystem: 'JET',
        doorCount: 1,
      };

      const result = evaluateIntent(intent);

      const jetEffect = result.effects.find(
        (e) => e.code === 'JET_REQUIRES_DEEP_SHELF'
      );
      expect(jetEffect).toBeDefined();
      expect(jetEffect?.severity).toBe('warn');
    });

    it('should select cup hinges for swing doors', () => {
      const intent = createDefaultIntentPDF();
      intent.door = {
        enabled: true,
        doorType: 'SWING',
        doorCount: 2,
      };

      const result = evaluateIntent(intent);

      const hingeEffect = result.effects.find(
        (e) => e.code === 'DOOR_SWING_CUP_HINGE'
      );
      expect(hingeEffect).toBeDefined();
    });
  });

  describe('Structural Rules', () => {
    it('should block Minifix on panels < 16mm', () => {
      const intent = createDefaultIntentPDF();
      intent.connectorType = 'MINIFIX';
      intent.panelThickness = 12;

      const result = evaluateIntent(intent);

      const minifixEffect = result.effects.find(
        (e) => e.code === 'MINIFIX_REQUIRES_16MM'
      );
      expect(minifixEffect).toBeDefined();
      expect(minifixEffect?.severity).toBe('block');
      expect(result.gate.blocked).toBe(true);
    });

    it('should allow Minifix on 18mm panels', () => {
      const intent = createDefaultIntentPDF();
      intent.connectorType = 'MINIFIX';
      intent.panelThickness = 18;

      const result = evaluateIntent(intent);

      const blockEffects = getBlockedEffects(result);
      const minifixBlocks = blockEffects.filter(
        (e) => e.code === 'MINIFIX_REQUIRES_16MM'
      );
      expect(minifixBlocks).toHaveLength(0);
    });
  });

  describe('checkRequirement', () => {
    it('should check requirement correctly', () => {
      const intent = createDefaultIntentPDF();

      const isLeftToRight = checkRequirement(intent, {
        path: 'compositionDirection',
        op: 'eq',
        value: 'LEFT_TO_RIGHT',
      });
      expect(isLeftToRight).toBe(true);

      const isRightToLeft = checkRequirement(intent, {
        path: 'compositionDirection',
        op: 'eq',
        value: 'RIGHT_TO_LEFT',
      });
      expect(isRightToLeft).toBe(false);
    });
  });

  describe('getBlockedEffects / getWarningEffects', () => {
    it('should return blocked effects', () => {
      const intent = createDefaultIntentPDF();
      intent.connectorType = 'MINIFIX';
      intent.panelThickness = 12;

      const result = evaluateIntent(intent);
      const blocked = getBlockedEffects(result);

      expect(blocked.length).toBeGreaterThan(0);
      expect(blocked.every((e) => e.severity === 'block')).toBe(true);
    });

    it('should return warning effects', () => {
      const intent = createDefaultIntentPDF();
      intent.drawer = {
        enabled: true,
        drawerCount: 1,
        slideType: 'UNDERMOUNT',
        openMechanism: 'PUSH_OPEN',
      };

      const result = evaluateIntent(intent);
      const warnings = getWarningEffects(result);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.every((e) => e.severity === 'warn')).toBe(true);
    });
  });
});

describe('Hardware Mapper', () => {
  it('should select base hardware for default intent', () => {
    const intent = createDefaultIntentPDF();
    const result = evaluateIntent(intent);

    // Should have minifix hardware
    const minifix = result.hardware.hardware.filter(
      (h) => h.catalogId.includes('MINIFIX')
    );
    expect(minifix.length).toBeGreaterThan(0);
  });

  it('should select levelers when base logic is adjustable foot', () => {
    const intent = createDefaultIntentPDF();
    intent.baseLogic = 'ADJUSTABLE_FOOT';

    const result = evaluateIntent(intent);

    const levelers = result.hardware.hardware.find(
      (h) => h.catalogId === 'LEVELER-ADJ'
    );
    expect(levelers).toBeDefined();
    expect(levelers?.quantity).toBe(4);
  });

  it('should select shelf pins for adjustable shelves', () => {
    const intent = createDefaultIntentPDF();
    intent.shelf = {
      enabled: true,
      supportType: 'ADJUSTABLE',
      count: 2,
      thickness: 18,
    };

    const result = evaluateIntent(intent);

    const pins = result.hardware.hardware.find(
      (h) => h.catalogId.includes('SHELF-PIN')
    );
    expect(pins).toBeDefined();
    expect(pins?.quantity).toBe(8); // 2 shelves × 4 pins
  });

  it('should select drawer slides and sync bar for push-open', () => {
    const intent = createDefaultIntentPDF();
    intent.drawer = {
      enabled: true,
      drawerCount: 2,
      slideType: 'UNDERMOUNT',
      openMechanism: 'PUSH_OPEN',
    };

    const result = evaluateIntent(intent);

    const slides = result.hardware.hardware.find(
      (h) => h.catalogId === 'UNDERMOUNT-SLIDE'
    );
    expect(slides).toBeDefined();
    expect(slides?.quantity).toBe(4); // 2 drawers × 2 slides

    const syncBar = result.hardware.hardware.find(
      (h) => h.catalogId === 'SYNC-BAR'
    );
    expect(syncBar).toBeDefined();
  });
});

describe('Drilling Mapper', () => {
  it('should generate drill operations for default intent', () => {
    const intent = createDefaultIntentPDF();
    const result = evaluateIntent(intent);

    expect(result.drilling.operations.length).toBeGreaterThan(0);
  });

  it('should include System 32 parameters', () => {
    const intent = createDefaultIntentPDF();
    const result = evaluateIntent(intent);

    expect(result.drilling.system32).toBeDefined();
    expect(result.drilling.system32?.firstHole).toBe(37);
    expect(result.drilling.system32?.pitch).toBe(32);
  });

  it('should generate shelf pin holes for adjustable shelves', () => {
    const intent = createDefaultIntentPDF();
    intent.shelf = {
      enabled: true,
      supportType: 'ADJUSTABLE',
      count: 1,
      thickness: 18,
    };

    const result = evaluateIntent(intent);

    const shelfPinOps = result.drilling.operations.filter(
      (op) => op.drillType === 'SHELF_PIN'
    );
    expect(shelfPinOps.length).toBeGreaterThan(0);
  });

  it('should generate back panel groove when enabled', () => {
    const intent = createDefaultIntentPDF();
    intent.backPanel = true;

    const result = evaluateIntent(intent);

    const grooveOps = result.drilling.operations.filter(
      (op) => op.drillType === 'GROOVE'
    );
    expect(grooveOps.length).toBe(4); // Left, right, top, bottom
  });
});

describe('Assembly Mapper', () => {
  it('should generate assembly steps', () => {
    const intent = createDefaultIntentPDF();
    const result = evaluateIntent(intent);

    expect(result.assembly.steps.length).toBeGreaterThan(0);
    expect(result.assembly.totalMinutes).toBeGreaterThan(0);
  });

  it('should start with left side for left-to-right assembly', () => {
    const intent = createDefaultIntentPDF();
    intent.compositionDirection = 'LEFT_TO_RIGHT';

    const result = evaluateIntent(intent);

    const firstStep = result.assembly.steps[0];
    expect(firstStep.panel).toBe('LEFT_SIDE');
    expect(firstStep.action).toBe('PLACE');
  });

  it('should include leveler installation when required', () => {
    const intent = createDefaultIntentPDF();
    intent.baseLogic = 'ADJUSTABLE_FOOT';

    const result = evaluateIntent(intent);

    const levelerStep = result.assembly.steps.find(
      (s) => s.instructionTH.includes('ขาปรับระดับ')
    );
    expect(levelerStep).toBeDefined();
  });

  it('should include drawer steps when drawers enabled', () => {
    const intent = createDefaultIntentPDF();
    intent.drawer = {
      enabled: true,
      drawerCount: 1,
      slideType: 'UNDERMOUNT',
    };

    const result = evaluateIntent(intent);

    const slideStep = result.assembly.steps.find(
      (s) => s.instructionTH.includes('รางลิ้นชัก')
    );
    expect(slideStep).toBeDefined();

    const insertStep = result.assembly.steps.find(
      (s) => s.instructionTH.includes('ใส่ลิ้นชัก')
    );
    expect(insertStep).toBeDefined();
  });

  it('should include door steps when doors enabled', () => {
    const intent = createDefaultIntentPDF();
    intent.door = {
      enabled: true,
      doorType: 'SWING',
      doorCount: 2,
    };

    const result = evaluateIntent(intent);

    const hingeStep = result.assembly.steps.find(
      (s) => s.instructionTH.includes('บานพับ')
    );
    expect(hingeStep).toBeDefined();

    const hangStep = result.assembly.steps.find(
      (s) => s.instructionTH.includes('แขวนบานประตู')
    );
    expect(hangStep).toBeDefined();
  });
});
