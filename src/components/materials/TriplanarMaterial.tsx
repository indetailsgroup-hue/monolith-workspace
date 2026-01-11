/**
 * TriplanarMaterial - World-Space Texture Mapping
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Solves UV stretching problem for parametric geometry
 * - Projects texture from 3 axes based on world position
 * - Works with any geometry regardless of UV coordinates
 * 
 * Based on research document section 5.2:
 * "Triplanar Mapping เป็นเทคนิคการเขียน Shader เพื่อแปะ Texture 
 *  โดยไม่อิงกับ UV ของโมเดล แต่อิงกับตำแหน่งในโลก 3 มิติ"
 */

import { useMemo, useRef, useEffect } from 'react';
import { 
  ShaderMaterial, 
  Texture, 
  Color, 
  Vector2,
  Vector3,
  DoubleSide
} from 'three';
// import { useFrame } from '@react-three/fiber';

// ============================================
// SHADER CODE
// ============================================

const vertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  // Calculate world position
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  
  // Calculate world normal
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  
  // Pass UV for fallback
  vUv = uv;
  
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uTexture;
uniform vec3 uColor;
uniform float uTextureScale;
uniform float uBlendSharpness;
uniform bool uHasTexture;

// Lighting uniforms
uniform vec3 uAmbientLight;
uniform vec3 uDirectionalLight;
uniform vec3 uDirectionalLightDir;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 blending = abs(normal);
  
  // Sharpen the blending
  blending = pow(blending, vec3(uBlendSharpness));
  
  // Normalize so they sum to 1
  blending /= (blending.x + blending.y + blending.z);
  
  vec3 finalColor;
  
  if (uHasTexture) {
    // Scale world position to texture coordinates
    // uTextureScale: mm per texture repeat (e.g., 1000 = 1 repeat per 1000mm)
    vec2 uvX = vWorldPosition.zy / uTextureScale;
    vec2 uvY = vWorldPosition.xz / uTextureScale;
    vec2 uvZ = vWorldPosition.xy / uTextureScale;
    
    // Sample texture from each projection
    vec3 texX = texture2D(uTexture, uvX).rgb;
    vec3 texY = texture2D(uTexture, uvY).rgb;
    vec3 texZ = texture2D(uTexture, uvZ).rgb;
    
    // Blend based on normal direction
    vec3 textureColor = texX * blending.x + texY * blending.y + texZ * blending.z;
    
    // Apply base color tint
    finalColor = textureColor * uColor;
  } else {
    finalColor = uColor;
  }
  
  // Simple lighting calculation
  float NdotL = max(dot(normal, uDirectionalLightDir), 0.0);
  vec3 diffuse = uDirectionalLight * NdotL;
  vec3 ambient = uAmbientLight;
  
  vec3 litColor = finalColor * (ambient + diffuse);
  
  gl_FragColor = vec4(litColor, 1.0);
}
`;

// ============================================
// REACT COMPONENT
// ============================================

export interface TriplanarMaterialProps {
  texture?: Texture | null;
  color?: string;
  textureScale?: number;      // mm per texture repeat
  blendSharpness?: number;    // Higher = sharper blend between projections
  emissive?: string;
  emissiveIntensity?: number;
}

export function useTriplanarMaterial(props: TriplanarMaterialProps = {}) {
  const {
    texture = null,
    color = '#ffffff',
    textureScale = 500,        // 1 repeat per 500mm
    blendSharpness = 4,
    emissive = '#000000',
    emissiveIntensity = 0,
  } = props;
  
  const materialRef = useRef<ShaderMaterial>(null);
  
  const material = useMemo(() => {
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture: { value: texture },
        uColor: { value: new Color(color) },
        uTextureScale: { value: textureScale },
        uBlendSharpness: { value: blendSharpness },
        uHasTexture: { value: !!texture },
        uAmbientLight: { value: new Color(0.4, 0.4, 0.4) },
        uDirectionalLight: { value: new Color(0.8, 0.8, 0.8) },
        uDirectionalLightDir: { value: new Vector3(0.5, 1.0, 0.5).normalize() },
      },
      side: DoubleSide,
    });
  }, []);
  
  // Update uniforms when props change
  useEffect(() => {
    if (material) {
      material.uniforms.uTexture.value = texture;
      material.uniforms.uHasTexture.value = !!texture;
      material.uniforms.uColor.value = new Color(color);
      material.uniforms.uTextureScale.value = textureScale;
      material.uniforms.uBlendSharpness.value = blendSharpness;
      material.needsUpdate = true;
    }
  }, [material, texture, color, textureScale, blendSharpness]);
  
  return material;
}

// ============================================
// SIMPLE VERSION (No custom shader)
// ============================================

/**
 * Simple approach using texture.repeat
 * Less accurate but simpler to implement
 * 
 * Use this if custom shader is too complex
 */
export function calculateTextureRepeat(
  panelWidthMM: number,
  panelHeightMM: number,
  textureScaleMM: number = 500
): Vector2 {
  return new Vector2(
    panelWidthMM / textureScaleMM,
    panelHeightMM / textureScaleMM
  );
}
