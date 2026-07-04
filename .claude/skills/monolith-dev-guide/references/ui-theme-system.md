# MONOLITH UI Theme Design System — Detailed Reference

## Table of Contents
1. [Surface Token Architecture](#surface-token-architecture)
2. [Token Scale & Values](#token-scale--values)
3. [Standard UI Patterns](#standard-ui-patterns)
4. [Color Accents by Context](#color-accents-by-context)
5. [Anti-Patterns (What NOT to Use)](#anti-patterns)
6. [Component Templates](#component-templates)
7. [Reference Components](#reference-components)
8. [X-Ray Mode Colors](#x-ray-mode-colors)

---

## Surface Token Architecture

MONOLITH uses a custom dark theme built on CSS custom properties (surface tokens) defined in `src/index.css` and extended via `tailwind.config.js`.

### How Tokens Work

In `index.css`:
```css
:root {
  --surface-0: 0 0 0;
  --surface-1: 5 5 5;
  --surface-2: 10 10 10;
  --surface-3: 17 17 17;
  --surface-4: 26 26 26;
}
```

In `tailwind.config.js`, these map to utility classes:
```
bg-surface-0  →  rgb(0, 0, 0)      Deepest background
bg-surface-1  →  rgb(5, 5, 5)      Main panel background
bg-surface-2  →  rgb(10, 10, 10)   Input fields, secondary containers
bg-surface-3  →  rgb(17, 17, 17)   Hover states, badges
bg-surface-4  →  rgb(26, 26, 26)   Elevated containers
```

The tokens use RGB channel values (space-separated) so Tailwind can apply opacity modifiers:
```html
<div class="bg-surface-1/80">  <!-- 80% opacity surface-1 -->
```

---

## Token Scale & Values

| Token | RGB Value | Hex Approx | Usage |
|-------|-----------|-----------|-------|
| `surface-0` | `rgb(0, 0, 0)` | `#000000` | Deepest background, canvas |
| `surface-1` | `rgb(5, 5, 5)` | `#050505` | Main panel background |
| `surface-2` | `rgb(10, 10, 10)` | `#0a0a0a` | Input fields, secondary containers, footer |
| `surface-3` | `rgb(17, 17, 17)` | `#111111` | Hover states, shortcut badges, elevated items |
| `surface-4` | `rgb(26, 26, 26)` | `#1a1a1a` | Highest elevation containers |

### Border Color
All borders use `border-[#333]` — a single consistent gray. This is the most important consistency rule. Never use `border-white/10`, `border-[#3a4a5a]`, or any other border color.

### Dividers
Horizontal dividers: `<div className="h-px bg-[#333]" />` (not `<hr>`, not `border-t`)

---

## Standard UI Patterns

Every new MONOLITH UI component should use these exact class patterns:

### Container (panel, card, section)
```jsx
<div className="bg-surface-1 border border-[#333] rounded-lg">
```

### Header (collapsible, section header)
```jsx
<div className="border-b border-[#333] hover:bg-surface-3 transition-all duration-200">
  <span className="text-xs font-medium text-white">Section Title</span>
</div>
```

### Button (standard)
```jsx
<button className="bg-surface-2 hover:bg-surface-3 border border-[#333] text-white rounded-lg transition-all duration-200">
```

### Input Field
```jsx
<input className="bg-surface-2 border border-[#333] rounded-lg text-white font-mono text-xs
  focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-all duration-200" />
```

### Select / Dropdown
```jsx
<select className="bg-surface-2 border border-[#333] rounded-lg text-white text-xs
  focus:border-green-500 focus:ring-1 focus:ring-green-500/20">
```

### Label
```jsx
<span className="text-[10px] text-gray-500">Field Label</span>
```

### Section Header (inside panel)
```jsx
<span className="text-[10px] text-gray-500 font-medium">SECTION NAME</span>
// or for emphasized headers:
<span className="text-xs font-medium text-white">Section Name</span>
```

### Menu Item (context menu, dropdown)
```jsx
<div className="text-gray-400 hover:text-white hover:bg-surface-3 transition-all duration-200 cursor-pointer">
```

### Divider
```jsx
<div className="h-px bg-[#333]" />
```

### Shortcut Badge / Tag
```jsx
<span className="text-gray-600 bg-surface-3 rounded px-1.5 py-0.5 text-[10px]">⌘K</span>
```

### Footer
```jsx
<div className="bg-surface-2 text-gray-500 text-[10px] border-t border-[#333]">
```

### All Transitions
Every interactive element uses: `transition-all duration-200`

---

## Color Accents by Context

| Context | Accent Color | Usage |
|---------|-------------|-------|
| Cabinet controls | `green-500` | Focus rings, toggles, active states |
| Manufacturing params | `purple-500` | Sliders, manufacturing-specific controls |
| Active/flipped state | `orange-400` | Flip indicator dots, active state text |
| Corner labels | `cyan-400` | Corner identification labels |
| Danger/reset | `red-400` | Delete buttons, reset actions |
| Hardware icon | `purple-400` | Wrench icon in hardware panels |

### Focus Ring Pattern
```jsx
focus:border-green-500 focus:ring-1 focus:ring-green-500/20
```

### Active Toggle Pattern
```jsx
// Active state
<div className="bg-green-500/20 text-green-400">ON</div>
// Inactive state
<div className="bg-surface-3 text-gray-500">OFF</div>
```

---

## Anti-Patterns

These patterns break visual consistency. Never use them in MONOLITH:

| Wrong | Why it's wrong | Correct |
|-------|---------------|---------|
| `bg-[#1a2535]` | Blue-gray tint, doesn't match neutral dark theme | `bg-surface-1` |
| `border-[#3a4a5a]` | Blue-tinted border | `border-[#333]` |
| `bg-[#0d1520]` | Blue-dark background | `bg-surface-2` or no explicit bg |
| `bg-gray-700` / `bg-gray-800` | Tailwind grays are slightly blue-tinted | `bg-surface-2` / `bg-surface-3` |
| `text-gray-300` | Too bright for secondary text | `text-gray-400` or `text-white` |
| `border-white/10` | Inconsistent with `#333` system | `border-[#333]` |
| `bg-white/10` | Semi-transparent white looks different on every bg | `bg-surface-3` |
| `hover:bg-white/10` | Same issue as above | `hover:bg-surface-3` |
| `transition-colors` (alone) | Missing duration, inconsistent timing | `transition-all duration-200` |
| `bg-[#1a1a1a]` | Close but not a token — use surface-4 | `bg-surface-4` |
| `backdrop-blur-xl` | Performance hit, not part of design system | Remove or use solid bg |

### The #333 Rule
The single most common mistake is using any border color other than `#333`. Even `border-gray-700` (which is `#374151`) is wrong. Always use `border-[#333]`.

---

## Component Templates

### Context Menu / Floating Panel

```jsx
<div className="bg-surface-1 border border-[#333] rounded-lg shadow-2xl overflow-hidden"
     style={{ width: '280px' }}>
  {/* Header */}
  <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
    <span className="text-xs font-medium text-white">Menu Title</span>
    <button className="text-gray-500 hover:text-white transition-all duration-200">
      <X size={14} />
    </button>
  </div>

  {/* Content */}
  <div className="p-2 space-y-1">
    {items.map(item => (
      <div key={item.id}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg
          text-gray-400 hover:text-white hover:bg-surface-3
          transition-all duration-200 cursor-pointer">
        <item.icon size={14} />
        <span className="text-xs">{item.label}</span>
        <span className="ml-auto text-gray-600 bg-surface-3 rounded px-1.5 py-0.5 text-[10px]">
          {item.shortcut}
        </span>
      </div>
    ))}
  </div>

  {/* Divider */}
  <div className="h-px bg-[#333]" />

  {/* Footer */}
  <div className="px-3 py-1.5 bg-surface-2 text-gray-500 text-[10px]">
    Footer info
  </div>
</div>
```

### Modal Dialog

```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
  <div className="bg-surface-1 border border-[#333] rounded-lg shadow-2xl"
       style={{ width: '480px', maxHeight: '80vh' }}>
    {/* Header */}
    <div className="flex items-center gap-2 px-4 py-3 border-b border-[#333]">
      <Icon size={16} className="text-emerald-400" />
      <span className="text-sm font-medium text-white">Modal Title</span>
    </div>

    {/* Body */}
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* Content here */}
    </div>

    {/* Footer */}
    <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#333]">
      <button className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3
        border border-[#333] rounded-lg text-gray-400 text-xs transition-all duration-200">
        Cancel
      </button>
      <button className="px-3 py-1.5 bg-green-600 hover:bg-green-500
        rounded-lg text-white text-xs transition-all duration-200">
        Confirm
      </button>
    </div>
  </div>
</div>
```

### Sidebar Section (Collapsible)

```jsx
<div className="bg-surface-1 border border-[#333] rounded-lg overflow-hidden">
  <button onClick={toggle}
    className="w-full flex items-center justify-between px-3 py-2
      hover:bg-surface-3 transition-all duration-200">
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-purple-400" />
      <span className="text-xs font-medium text-white">Section Title</span>
    </div>
    <ChevronDown size={12} className={`text-gray-500 transition-transform duration-200
      ${isOpen ? 'rotate-180' : ''}`} />
  </button>

  {isOpen && (
    <div className="px-3 pb-3 space-y-2 border-t border-[#333]">
      {/* Section content */}
    </div>
  )}
</div>
```

---

## Reference Components

When creating new UI components, study these files for style guidance:

| Component | File | Pattern |
|-----------|------|---------|
| **ParametricContractPanel** | `src/components/layout/ParametricContractPanel.tsx` | Canonical design system reference — sidebar with sections, inputs, labels |
| **PanelConfigModal** | `src/components/ui/PanelConfigModal.tsx` | Modal dialog with tabs, dropdowns, color pickers |
| **HardwareContextMenu** | `src/components/ui/HardwareContextMenu.tsx` | Context menu / floating panel with menu items, shortcuts, sections |

`ParametricContractPanel` is the gold standard. When in doubt, check how it handles a pattern.

---

## X-Ray Mode Colors

X-Ray mode (`Alt+Z`) changes hardware rendering colors:

| Element | Normal Mode | X-Ray Mode |
|---------|------------|------------|
| Hardware body | `#909090` (metallic gray) | `#00ffff` (cyan) |
| Cam housing | `#909090` | `#00ffff` |
| Bolt | `#909090` | `#00ffff` |
| Drill indicators | Standard colors | Standard colors (unchanged) |

Note: Preview3D in MinifixConfigPanel always renders with `xRayMode={false}` — it shows normal metallic materials regardless of the main viewport's X-Ray state.
