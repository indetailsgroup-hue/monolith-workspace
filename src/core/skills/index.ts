/**
 * Skills System - Registry & Exports
 *
 * Central registry for all deterministic skills.
 * No AI required - just predefined workflows.
 *
 * @version 1.0.0
 */

import type { AnySkill, SkillRegistry, SkillContext, SkillResult, Skill } from './types';

// ============================================
// SKILL REGISTRY IMPLEMENTATION
// ============================================

class SkillRegistryImpl implements SkillRegistry {
  skills: Map<string, AnySkill> = new Map();

  register(skill: AnySkill): void {
    if (this.skills.has(skill.id)) {
      console.warn(`[Skills] Skill '${skill.id}' already registered, overwriting`);
    }
    this.skills.set(skill.id, skill);
    console.log(`[Skills] Registered: ${skill.id} (${skill.category})`);
  }

  get(id: string): AnySkill | undefined {
    return this.skills.get(id);
  }

  async execute<T>(id: string, context: SkillContext): Promise<SkillResult<T>> {
    const skill = this.skills.get(id);

    if (!skill) {
      return {
        status: 'error',
        issues: [{
          code: 'SKILL_NOT_FOUND',
          message: `Skill '${id}' not found in registry`,
          severity: 'error',
        }],
        duration: 0,
        summary: `Skill '${id}' not found`,
      };
    }

    const startTime = performance.now();

    try {
      const result = await skill.execute(context);
      return result as SkillResult<T>;
    } catch (error) {
      const duration = performance.now() - startTime;
      return {
        status: 'error',
        issues: [{
          code: 'SKILL_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          severity: 'error',
        }],
        duration,
        summary: `Skill '${id}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  list(): AnySkill[] {
    return Array.from(this.skills.values());
  }

  listByCategory(category: Skill['category']): AnySkill[] {
    return this.list().filter(s => s.category === category);
  }
}

// ============================================
// GLOBAL REGISTRY INSTANCE
// ============================================

export const skillRegistry = new SkillRegistryImpl();

// ============================================
// RE-EXPORTS
// ============================================

export * from './types';

// ============================================
// SKILL REGISTRATION (Auto-register on import)
// ============================================

// Import and register skills here
// Skills will be registered when their modules are imported

/**
 * Initialize all skills
 * Call this once at app startup
 *
 * Individual skill import failures are handled gracefully -
 * other skills will still be registered even if one fails.
 */
export async function initializeSkills(): Promise<void> {
  const skillImports = [
    { path: './verify/verifyCabinet', exportName: 'verifyCabinetSkill' },
    { path: './generate/cutList', exportName: 'generateCutListSkill' },
    { path: './generate/bom', exportName: 'generateBOMSkill' },
  ] as const;

  const failedSkills: string[] = [];

  // Import and register each skill individually to handle failures gracefully
  await Promise.all(
    skillImports.map(async ({ path, exportName }) => {
      try {
        const module = await import(/* @vite-ignore */ path);
        const skill = module[exportName];

        if (!skill) {
          console.error(`[Skills] Export '${exportName}' not found in '${path}'`);
          failedSkills.push(exportName);
          return;
        }

        skillRegistry.register(skill);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Skills] Failed to load skill from '${path}': ${errorMessage}`);
        failedSkills.push(exportName);
      }
    })
  );

  const successCount = skillRegistry.list().length;
  const totalCount = skillImports.length;

  if (failedSkills.length > 0) {
    console.warn(
      `[Skills] Initialized ${successCount}/${totalCount} skills. ` +
      `Failed: ${failedSkills.join(', ')}`
    );
  } else {
    console.log(`[Skills] Initialized ${successCount} skills`);
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Execute a skill by ID
 */
export async function runSkill<T>(
  skillId: string,
  context: SkillContext
): Promise<SkillResult<T>> {
  return skillRegistry.execute<T>(skillId, context);
}

/**
 * Get all available skills
 */
export function getAvailableSkills(): Skill[] {
  return skillRegistry.list();
}

/**
 * Get skills by category
 */
export function getSkillsByCategory(category: Skill['category']): Skill[] {
  return skillRegistry.listByCategory(category);
}
