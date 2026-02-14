/**
 * SceneLights.tsx - Lighting setup for 3D cabinet scene
 *
 * Features:
 * - Ambient light for base illumination
 * - Main directional light with shadows
 * - Fill light for softer shadows
 * - Hemisphere light for natural color blending
 *
 * @version 1.0.0
 */

// ============================================
// TYPES
// ============================================

export interface SceneLightsProps {
  /**
   * Ambient light intensity (0-1)
   */
  ambientIntensity?: number;

  /**
   * Main directional light intensity (0-2)
   */
  mainIntensity?: number;

  /**
   * Fill light intensity (0-1)
   */
  fillIntensity?: number;

  /**
   * Hemisphere light intensity (0-1)
   */
  hemisphereIntensity?: number;

  /**
   * Enable shadows
   */
  enableShadows?: boolean;

  /**
   * Shadow map resolution
   */
  shadowMapSize?: number;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function SceneLights({
  ambientIntensity = 0.4,
  mainIntensity = 1.2,
  fillIntensity = 0.3,
  hemisphereIntensity = 0.3,
  enableShadows = true,
  shadowMapSize = 2048,
}: SceneLightsProps) {
  return (
    <group name="scene-lights">
      {/* Ambient light - base illumination for all surfaces */}
      <ambientLight intensity={ambientIntensity} />

      {/* Main directional light - primary light source (sun-like) */}
      {/* Position: top-front-right for natural cabinet lighting */}
      <directionalLight
        position={[2000, 3000, 2000]}
        intensity={mainIntensity}
        castShadow={enableShadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-far={10000}
        shadow-camera-left={-3000}
        shadow-camera-right={3000}
        shadow-camera-top={3000}
        shadow-camera-bottom={-3000}
        shadow-bias={-0.0001}
      />

      {/* Fill light - soften shadows from opposite side */}
      <directionalLight
        position={[-1500, 1000, -1000]}
        intensity={fillIntensity}
      />

      {/* Hemisphere light - sky/ground color blending */}
      {/* Sky color: light blue, Ground color: dark gray */}
      <hemisphereLight
        args={['#87ceeb', '#3d3d3d', hemisphereIntensity]}
      />

      {/* Optional: Point light for interior cabinet illumination */}
      {/* Uncomment if cabinets have open fronts that need interior lighting */}
      {/*
      <pointLight
        position={[500, 500, 500]}
        intensity={0.5}
        distance={2000}
        decay={2}
      />
      */}
    </group>
  );
}

export default SceneLights;
