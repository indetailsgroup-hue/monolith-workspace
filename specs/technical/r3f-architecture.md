# React Three Fiber Architecture Deep Dive

**Project:** MONOLITH Designer Workspace v2.0
**Document Version:** 1.0
**Date:** 2026-01-10
**Status:** Active

---

## Table of Contents

1. [Overview](#overview)
2. [Core Architecture](#core-architecture)
3. [Component Patterns](#component-patterns)
4. [State Management](#state-management)
5. [Performance Optimization](#performance-optimization)
6. [Material System](#material-system)
7. [Camera & Controls](#camera--controls)
8. [Event System](#event-system)
9. [Memory Management](#memory-management)
10. [Best Practices](#best-practices)

---

## 1. Overview

### 1.1 What is React Three Fiber?

React Three Fiber (R3F) is a **React renderer for Three.js**. It allows developers to build 3D scenes declaratively using React components, while maintaining direct access to the Three.js API when needed.

**Key Characteristics:**
- 📦 **Declarative:** Describe what you want, not how to build it
- ⚡ **Performant:** No overhead in render loop
- 🎯 **Type-Safe:** Full TypeScript support
- 🔧 **Flexible:** Drop down to Three.js when needed
- 🌐 **Web-Native:** Integrates seamlessly with React ecosystem

### 1.2 Architecture Philosophy

```
┌─────────────────────────────────────────────┐
│           React Component Tree              │
│  (Declarative State & Component Lifecycle)  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         R3F Reconciler (Fiber)              │
│   (Maps React Components to Three.js)       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         Three.js Scene Graph                │
│      (Actual 3D Objects & Rendering)        │
└─────────────────────────────────────────────┘
```

---

## 2. Core Architecture

### 2.1 Canvas Component

The `<Canvas>` component is the **root** of every R3F application.

```tsx
import { Canvas } from '@react-three/fiber'

function App() {
  return (
    <Canvas
      // Camera configuration
      camera={{ position: [0, 0, 5], fov: 75 }}

      // Render mode
      frameloop="demand" // or "always" or "never"

      // Performance settings
      dpr={[1, 2]} // Device pixel ratio (min, max)

      // WebGL settings
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance"
      }}

      // Scene settings
      shadows // Enable shadow mapping
      linear // Use linear color space
    >
      {/* Your 3D content here */}
    </Canvas>
  )
}
```

**Canvas automatically creates:**
- `WebGLRenderer`
- `Scene`
- `Camera` (PerspectiveCamera by default)
- `Raycaster` (for pointer events)
- Animation loop

### 2.2 Scene Graph Structure

Every R3F component maps to a Three.js object:

```tsx
// React Three Fiber
<mesh position={[0, 0, 0]} rotation={[0, Math.PI / 4, 0]}>
  <boxGeometry args={[1, 1, 1]} />
  <meshStandardMaterial color="orange" />
</mesh>

// Equivalent Three.js code
const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshStandardMaterial({ color: 'orange' })
const mesh = new THREE.Mesh(geometry, material)
mesh.position.set(0, 0, 0)
mesh.rotation.set(0, Math.PI / 4, 0)
scene.add(mesh)
```

### 2.3 The Render Loop

**How R3F renders:**

1. **React's Reconciliation Phase:**
   - React compares component tree
   - Identifies what changed
   - Updates R3F's internal fiber tree

2. **R3F's Commit Phase:**
   - Updates Three.js objects directly
   - No re-rendering of entire scene

3. **Three.js Render Phase:**
   - `renderer.render(scene, camera)`
   - Happens outside React's render cycle

```tsx
import { useFrame } from '@react-three/fiber'

function Box() {
  const meshRef = useRef<THREE.Mesh>(null!)

  // This runs OUTSIDE React's render cycle
  // Directly mutates Three.js object
  useFrame((state, delta) => {
    meshRef.current.rotation.x += delta
    // No setState, no re-render, no overhead
  })

  return (
    <mesh ref={meshRef}>
      <boxGeometry />
      <meshStandardMaterial />
    </mesh>
  )
}
```

---

## 3. Component Patterns

### 3.1 Primitive Component

Use `<primitive>` to wrap existing Three.js objects:

```tsx
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

function Model() {
  const gltf = useLoader(GLTFLoader, '/model.gltf')
  return <primitive object={gltf.scene} />
}
```

### 3.2 Geometry & Material Pattern

**Attach geometries and materials inline:**

```tsx
<mesh>
  <boxGeometry args={[1, 1, 1]} />
  <meshStandardMaterial
    color="hotpink"
    metalness={0.5}
    roughness={0.2}
  />
</mesh>
```

### 3.3 Group Pattern

Use `<group>` to organize objects:

```tsx
function Cabinet() {
  return (
    <group position={[0, 0, 0]}>
      {/* Top panel */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[2, 0.1, 1]} />
        <meshStandardMaterial />
      </mesh>

      {/* Bottom panel */}
      <mesh position={[0, -1, 0]}>
        <boxGeometry args={[2, 0.1, 1]} />
        <meshStandardMaterial />
      </mesh>
    </group>
  )
}
```

### 3.4 Instance Pattern (High Performance)

For rendering many similar objects:

```tsx
import { Instance, Instances } from '@react-three/drei'

function Trees() {
  return (
    <Instances limit={1000}>
      <cylinderGeometry args={[0.1, 0.1, 2]} />
      <meshStandardMaterial color="brown" />

      {Array.from({ length: 1000 }).map((_, i) => (
        <Instance
          key={i}
          position={[
            Math.random() * 100 - 50,
            0,
            Math.random() * 100 - 50
          ]}
        />
      ))}
    </Instances>
  )
}
```

**Performance Benefit:**
- 1000 objects with 1000 `<mesh>` = 1000 draw calls ❌
- 1000 objects with `<Instances>` = 1 draw call ✅

---

## 4. State Management

### 4.1 Zustand Integration (Recommended)

**Store Definition:**

```tsx
import create from 'zustand'
import { Material } from './types'

interface CabinetStore {
  // State
  width: number
  height: number
  depth: number
  selectedMaterial: Material

  // Actions
  setDimension: (dim: 'width' | 'height' | 'depth', value: number) => void
  setMaterial: (material: Material) => void
}

export const useCabinetStore = create<CabinetStore>((set) => ({
  width: 600,
  height: 720,
  depth: 350,
  selectedMaterial: { id: 'oak', name: 'Oak' },

  setDimension: (dim, value) => set({ [dim]: value }),
  setMaterial: (material) => set({ selectedMaterial: material })
}))
```

**Usage in R3F Component:**

```tsx
import { useCabinetStore } from './store'

function Cabinet3D() {
  const width = useCabinetStore(s => s.width)
  const height = useCabinetStore(s => s.height)
  const depth = useCabinetStore(s => s.depth)

  return (
    <mesh>
      <boxGeometry args={[width / 1000, height / 1000, depth / 1000]} />
      <meshStandardMaterial />
    </mesh>
  )
}
```

**Why Zustand?**
- ✅ No Provider wrapping needed
- ✅ Minimal re-renders (selector-based)
- ✅ DevTools support
- ✅ Tiny bundle size (~1KB)

### 4.2 useThree Hook

Access Three.js internals:

```tsx
import { useThree } from '@react-three/fiber'

function CameraController() {
  const { camera, gl, scene, size } = useThree()

  useEffect(() => {
    console.log('Canvas size:', size.width, size.height)
    console.log('Camera:', camera)
    console.log('Renderer:', gl)
  }, [camera, gl, size])

  return null
}
```

---

## 5. Performance Optimization

### 5.1 On-Demand Rendering

**Problem:** Continuous rendering wastes CPU/GPU when nothing changes.

**Solution:**

```tsx
// App level
<Canvas frameloop="demand">
  <Scene />
</Canvas>

// Trigger re-render when needed
import { useThree } from '@react-three/fiber'

function InteractiveObject() {
  const invalidate = useThree(s => s.invalidate)

  return (
    <mesh onClick={() => invalidate()}>
      <boxGeometry />
      <meshStandardMaterial />
    </mesh>
  )
}
```

### 5.2 Level of Detail (LOD)

```tsx
import { Lod } from '@react-three/drei'

function OptimizedModel() {
  return (
    <Lod distances={[0, 10, 20]}>
      {/* High poly - close to camera */}
      <mesh geometry={highPolyGeo}>
        <meshStandardMaterial />
      </mesh>

      {/* Medium poly */}
      <mesh geometry={mediumPolyGeo}>
        <meshStandardMaterial />
      </mesh>

      {/* Low poly - far from camera */}
      <mesh geometry={lowPolyGeo}>
        <meshBasicMaterial />
      </mesh>
    </Lod>
  )
}
```

### 5.3 Frustum Culling

```tsx
<mesh frustumCulled>
  {/* Automatically hidden when outside camera view */}
</mesh>
```

### 5.4 Texture Optimization

**Use compressed formats:**

```tsx
import { useTexture } from '@react-three/drei'

function TexturedBox() {
  const texture = useTexture('/texture.ktx2') // or .basis

  return (
    <mesh>
      <boxGeometry />
      <meshStandardMaterial map={texture} />
    </mesh>
  )
}
```

**Compression benefits:**
- KTX2/Basis: 75-90% size reduction
- GPU-native format (no decompression on CPU)
- Faster loading and less VRAM usage

### 5.5 Geometry Sharing

**Bad:**
```tsx
{panels.map(panel => (
  <mesh key={panel.id}>
    <boxGeometry args={[1, 1, 1]} /> {/* New geometry each time! */}
    <meshStandardMaterial />
  </mesh>
))}
```

**Good:**
```tsx
const sharedGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])

{panels.map(panel => (
  <mesh key={panel.id} geometry={sharedGeometry}>
    <meshStandardMaterial />
  </mesh>
))}
```

---

## 6. Material System

### 6.1 Material Types

```tsx
// Basic (unlit)
<meshBasicMaterial color="red" />

// Standard (PBR)
<meshStandardMaterial
  color="white"
  metalness={0.5}
  roughness={0.2}
  map={texture}
  normalMap={normalMap}
/>

// Physical (Advanced PBR)
<meshPhysicalMaterial
  transmission={0.9} // Glass-like
  thickness={0.5}
  roughness={0}
  clearcoat={1}
/>

// Custom Shader
<shaderMaterial
  uniforms={{ time: { value: 0 } }}
  vertexShader={vertexShader}
  fragmentShader={fragmentShader}
/>
```

### 6.2 Material Caching

```tsx
import { useMemo } from 'react'
import { MeshStandardMaterial } from 'three'

function Panel({ color, texture }: PanelProps) {
  const material = useMemo(() => {
    const mat = new MeshStandardMaterial({
      color,
      map: texture,
      metalness: 0.1,
      roughness: 0.8
    })
    return mat
  }, [color, texture])

  return <mesh material={material}>...</mesh>
}
```

### 6.3 Texture Loading

```tsx
import { useTexture } from '@react-three/drei'

function TexturedMesh() {
  const [colorMap, normalMap, roughnessMap] = useTexture([
    '/color.jpg',
    '/normal.jpg',
    '/roughness.jpg'
  ])

  return (
    <mesh>
      <planeGeometry args={[5, 5]} />
      <meshStandardMaterial
        map={colorMap}
        normalMap={normalMap}
        roughnessMap={roughnessMap}
      />
    </mesh>
  )
}
```

---

## 7. Camera & Controls

### 7.1 Camera Configuration

```tsx
// Perspective Camera (default)
<Canvas camera={{
  position: [0, 0, 5],
  fov: 75,
  near: 0.1,
  far: 1000
}}>

// Orthographic Camera
<Canvas
  orthographic
  camera={{
    position: [10, 10, 10],
    zoom: 50
  }}
>
```

### 7.2 Orbit Controls

```tsx
import { OrbitControls } from '@react-three/drei'

<Canvas>
  <OrbitControls
    enablePan={true}
    enableZoom={true}
    enableRotate={true}
    minDistance={2}
    maxDistance={20}
    maxPolarAngle={Math.PI / 2} // Prevent going below ground
  />
</Canvas>
```

### 7.3 Camera Presets (Six-View System)

```tsx
import { PerspectiveCamera } from '@react-three/drei'

const cameraPresets = {
  perspective: { position: [5, 5, 5], target: [0, 0, 0] },
  front: { position: [0, 0, 10], target: [0, 0, 0] },
  left: { position: [-10, 0, 0], target: [0, 0, 0] },
  top: { position: [0, 10, 0], target: [0, 0, 0] },
  install: { position: [3, 2, 5], target: [0, 1, 0] },
  factory: { position: [0, 10, 0], target: [0, 0, 0] }
}

function CameraController({ preset }: { preset: keyof typeof cameraPresets }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null!)
  const { position, target } = cameraPresets[preset]

  useFrame((state, delta) => {
    // Smooth transition
    cameraRef.current.position.lerp(new THREE.Vector3(...position), 0.1)
    cameraRef.current.lookAt(new THREE.Vector3(...target))
  })

  return <PerspectiveCamera ref={cameraRef} makeDefault />
}
```

---

## 8. Event System

### 8.1 Pointer Events

```tsx
function InteractiveCube() {
  const [hovered, setHovered] = useState(false)
  const [clicked, setClicked] = useState(false)

  return (
    <mesh
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onClick={() => setClicked(!clicked)}
      onPointerDown={(e) => console.log('Down', e.point)}
      onPointerUp={(e) => console.log('Up', e.point)}
      onPointerMove={(e) => console.log('Move', e.point)}
    >
      <boxGeometry />
      <meshStandardMaterial color={hovered ? 'hotpink' : 'orange'} />
    </mesh>
  )
}
```

### 8.2 Raycasting (Manual)

```tsx
import { useThree } from '@react-three/fiber'

function CustomRaycast() {
  const { raycaster, camera, scene } = useThree()

  const handleClick = (event: MouseEvent) => {
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    )

    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObjects(scene.children, true)

    if (intersects.length > 0) {
      console.log('Hit:', intersects[0].object)
    }
  }

  return null
}
```

---

## 9. Memory Management

### 9.1 Automatic Disposal

R3F automatically calls `dispose()` on:
- Geometries
- Materials
- Textures

when components unmount. **But be aware of edge cases:**

### 9.2 Manual Cleanup

```tsx
function VideoTexture() {
  const videoRef = useRef<HTMLVideoElement>(null!)
  const textureRef = useRef<THREE.VideoTexture>(null!)

  useEffect(() => {
    const video = videoRef.current
    const texture = new THREE.VideoTexture(video)
    textureRef.current = texture

    return () => {
      // Cleanup
      texture.dispose()
      video.pause()
      video.src = ''
      video.load()
    }
  }, [])

  return (
    <mesh>
      <planeGeometry />
      <meshBasicMaterial map={textureRef.current} />
    </mesh>
  )
}
```

### 9.3 Shared Resources

```tsx
// Good: Share geometry/material across instances
const sharedGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
const sharedMat = useMemo(() => new THREE.MeshStandardMaterial(), [])

{panels.map(panel => (
  <mesh key={panel.id} geometry={sharedGeo} material={sharedMat} />
))}

// Don't forget to dispose when parent unmounts
useEffect(() => {
  return () => {
    sharedGeo.dispose()
    sharedMat.dispose()
  }
}, [])
```

---

## 10. Best Practices

### 10.1 Component Structure

```tsx
// ✅ Good: Separate concerns
function Scene() {
  return (
    <>
      <Lights />
      <Environment />
      <Models />
      <Effects />
    </>
  )
}

// ❌ Bad: Everything in one component
function Scene() {
  return (
    <group>
      <ambientLight />
      <directionalLight />
      <mesh>...</mesh>
      <mesh>...</mesh>
      {/* 500 lines... */}
    </group>
  )
}
```

### 10.2 Avoid Recreating Objects

```tsx
// ❌ Bad: Creates new Vector3 every frame
useFrame(() => {
  meshRef.current.position.copy(new THREE.Vector3(1, 2, 3))
})

// ✅ Good: Reuse or mutate directly
const targetPos = useMemo(() => new THREE.Vector3(1, 2, 3), [])
useFrame(() => {
  meshRef.current.position.copy(targetPos)
})

// ✅ Even better: Direct mutation
useFrame(() => {
  meshRef.current.position.set(1, 2, 3)
})
```

### 10.3 Use React.memo for Heavy Components

```tsx
const HeavyModel = React.memo(({ position }: { position: [number, number, number] }) => {
  const gltf = useLoader(GLTFLoader, '/heavy-model.gltf')
  return <primitive object={gltf.scene} position={position} />
})
```

### 10.4 Lazy Loading

```tsx
import { Suspense, lazy } from 'react'

const HeavyScene = lazy(() => import('./HeavyScene'))

function App() {
  return (
    <Canvas>
      <Suspense fallback={<Loader />}>
        <HeavyScene />
      </Suspense>
    </Canvas>
  )
}
```

### 10.5 TypeScript Best Practices

```tsx
import { MeshProps } from '@react-three/fiber'
import * as THREE from 'three'

interface CustomMeshProps extends MeshProps {
  customProp: string
}

const CustomMesh = forwardRef<THREE.Mesh, CustomMeshProps>(
  ({ customProp, ...props }, ref) => {
    return (
      <mesh ref={ref} {...props}>
        <boxGeometry />
        <meshStandardMaterial />
      </mesh>
    )
  }
)
```

---

## 11. Common Pitfalls

### 11.1 State Updates in useFrame

```tsx
// ❌ Bad: Triggers React re-render every frame
useFrame(() => {
  setRotation(rotation + 0.01) // 60 times per second!
})

// ✅ Good: Mutate directly
useFrame(() => {
  meshRef.current.rotation.y += 0.01
})
```

### 11.2 Forgetting `args`

```tsx
// ❌ Bad: args must be array
<boxGeometry args={1, 1, 1} />

// ✅ Good
<boxGeometry args={[1, 1, 1]} />
```

### 11.3 Not Using Keys in Lists

```tsx
// ❌ Bad: No key
{panels.map(panel => <Panel panel={panel} />)}

// ✅ Good
{panels.map(panel => <Panel key={panel.id} panel={panel} />)}
```

---

## 12. Advanced Patterns

### 12.1 Portals

Render to different scenes:

```tsx
import { createPortal } from '@react-three/fiber'

function Portal() {
  const [scene] = useState(() => new THREE.Scene())

  return (
    <>
      {createPortal(<BoxInPortal />, scene)}
      <RenderTexture attach="map">
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        <primitive object={scene} />
      </RenderTexture>
    </>
  )
}
```

### 12.2 Custom Hooks

```tsx
function useCameraZoom(target: THREE.Vector3, distance: number) {
  const { camera } = useThree()

  useEffect(() => {
    const targetPos = target.clone().add(
      camera.position.clone().normalize().multiplyScalar(distance)
    )

    // Animate camera
    gsap.to(camera.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1
    })
  }, [target, distance, camera])
}
```

### 12.3 Post-Processing

```tsx
import { EffectComposer, Bloom, SSAO } from '@react-three/postprocessing'

<Canvas>
  <Scene />
  <EffectComposer>
    <Bloom intensity={1.5} />
    <SSAO />
  </EffectComposer>
</Canvas>
```

---

## 13. Summary

### Key Takeaways

| Concept | Why It Matters |
|---------|---------------|
| **Declarative** | Easier to reason about, less bugs |
| **useFrame** | Animation without re-renders |
| **Zustand** | Minimal re-renders, clean state management |
| **On-Demand Rendering** | Battery life, reduced heat |
| **Instancing** | Render thousands of objects efficiently |
| **LOD** | Performance on low-end devices |
| **Proper Disposal** | No memory leaks |

### Architecture Checklist

- ✅ Use `<Canvas frameloop="demand">` for static scenes
- ✅ Implement LOD for complex models
- ✅ Use `<Instances>` for repeated objects
- ✅ Compress textures (KTX2/Basis)
- ✅ Share geometries and materials
- ✅ Use Zustand for global state
- ✅ Use `React.memo` for expensive components
- ✅ Implement proper cleanup in `useEffect`
- ✅ Use TypeScript for type safety
- ✅ Profile with React DevTools & Stats.js

---

## 14. References

1. [React Three Fiber Documentation](https://docs.pmnd.rs/react-three-fiber)
2. [Three.js Documentation](https://threejs.org/docs/)
3. [Drei Helper Library](https://github.com/pmndrs/drei)
4. [Poimandres Discord Community](https://discord.gg/poimandres)
5. [WebGL Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)

---

**Document Control:**
- **Version:** 1.0
- **Last Updated:** 2026-01-10
- **Next Review:** 2026-04-10
- **Owner:** MONOLITH Technical Team
- **Status:** ✅ Active
