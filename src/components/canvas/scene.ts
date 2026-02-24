/**
 * Scene Utilities
 *
 * Re-exports all scene symbols from the scene/ directory so that
 * imports from './scene' resolve correctly (the file takes priority
 * over the scene/ directory when both exist).
 */

// Re-export everything from the scene directory
export { SceneObjectRef } from './scene/SceneObjectRef';
export { SceneRegistryProvider, useSceneRegistry } from './scene/SceneRegistry';
