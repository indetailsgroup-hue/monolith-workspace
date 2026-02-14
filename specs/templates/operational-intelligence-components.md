# Operational Intelligence Component Library

> Dark Mode Documentation Design System for MONOLITH Designer Workspace

---

## Design Principles

### Core Philosophy
- **Trustworthy & Futuristic** - Modern, systematic, professional
- **Dark Mode First** - Reduces eye strain, highlights content
- **Information Dense** - Bento Grid maximizes content visibility
- **Functional Colors** - Green = success, Red = warning, Blue = info, Amber = caution

---

## Color Palette

### Surfaces (Backgrounds)

| Token | Hex | Usage |
|-------|-----|-------|
| `surface-0` | `#000000` | Page background |
| `surface-1` | `#050505` | Subtle elevation |
| `surface-2` | `#0A0A0A` | Cards, panels |
| `surface-3` | `#111111` | Nested content |
| `surface-4` | `#1A1A1A` | Hover states |

### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `border-default` | `#333333` | Card borders |
| `border-subtle` | `rgba(255,255,255,0.1)` | Dividers |
| `border-hover` | `#555555` | Interactive hover |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `text-primary` | `#FFFFFF` | Headlines, emphasis |
| `text-secondary` | `#888888` | Body text |
| `text-muted` | `#666666` | Labels, captions |

### Accent Colors

| Token | Hex | Meaning |
|-------|-----|---------|
| `accent-green` | `#22C55E` | Success, growth, positive |
| `accent-red` | `#EF4444` | Error, warning, risk |
| `accent-blue` | `#3B82F6` | Information, links |
| `accent-amber` | `#F59E0B` | Caution, attention |

---

## Typography

### Font Stack

```css
font-family: 'Inter', system-ui, sans-serif;  /* UI text */
font-family: 'JetBrains Mono', monospace;     /* Code, values */
```

### Scale

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| H1 (Hero) | 48px / 3rem | 500 | gradient-text |
| H2 (Section) | 24px / 1.5rem | 500 | text-primary |
| H3 (Card) | 18px / 1.125rem | 500 | text-primary |
| Body | 14px / 0.875rem | 400 | text-secondary |
| Caption | 12px / 0.75rem | 400 | text-muted |
| Mono | 12px / 0.75rem | 400 | accent-green |

---

## Component Patterns

### 1. Badge / Tag

```html
<div class="text-xs font-mono text-accent-green border border-accent-green/30 px-2 py-1 rounded">
    CORE SYSTEM
</div>
```

Variants:
- Green: `text-accent-green border-accent-green/30` - Core, primary
- Blue: `text-accent-blue border-accent-blue/30` - Feature, info
- Amber: `text-accent-amber border-accent-amber/30` - Optimization, attention
- Red: `text-accent-red border-accent-red/30` - Advanced, warning
- Neutral: `text-text-secondary border-border-default` - Default

---

### 2. Bento Card

```html
<div class="border border-border-default bg-surface-2 rounded-xl p-6 card-hover">
    <div class="flex items-start justify-between mb-4">
        <!-- Badge -->
        <div class="text-xs font-mono ...">LABEL</div>
        <!-- Version (optional) -->
        <div class="text-xs text-text-muted">v1.0</div>
    </div>
    <h3 class="text-lg font-medium mb-2">Card Title</h3>
    <p class="text-text-secondary text-sm mb-4">
        Description text...
    </p>
    <!-- Content area -->
</div>
```

Sizes:
- Standard: `col-span-1`
- Wide: `lg:col-span-2`
- Full: `lg:col-span-3`

---

### 3. Stat Card

```html
<div class="flex items-center gap-3">
    <div class="w-10 h-10 rounded-lg bg-surface-2 border border-border-default flex items-center justify-center">
        <span class="text-accent-green font-mono text-sm">42</span>
    </div>
    <div>
        <div class="text-sm text-text-secondary">Metric Label</div>
    </div>
</div>
```

---

### 4. Code Block

```html
<div class="code-block rounded-xl p-6">
    <!-- Window controls -->
    <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-accent-red"></div>
            <div class="w-3 h-3 rounded-full bg-accent-amber"></div>
            <div class="w-3 h-3 rounded-full bg-accent-green"></div>
        </div>
        <span class="text-xs font-mono text-text-muted">filename.ts</span>
    </div>
    <!-- Code content -->
    <pre class="text-sm font-mono overflow-x-auto"><code>...</code></pre>
</div>
```

Syntax highlighting classes:
- Keywords: `text-accent-blue`
- Types: `text-accent-amber`
- Strings/Values: `text-accent-green`
- Comments: `text-text-muted`
- Default: `text-text-secondary`

---

### 5. Formula Block

```html
<div class="bg-surface-3 rounded-lg p-4 border border-border-subtle">
    <div class="text-xs text-text-muted mb-2">Formula Name</div>
    <code class="font-mono text-accent-green">DW = LW - 42mm</code>
</div>
```

---

### 6. Alert / Status Card

#### Success
```html
<div class="border border-accent-green/30 bg-accent-green/5 rounded-xl p-4 flex items-start gap-4">
    <div class="w-8 h-8 rounded-lg bg-accent-green/20 flex items-center justify-center flex-shrink-0">
        <span class="text-accent-green">✓</span>
    </div>
    <div>
        <h4 class="font-medium text-accent-green mb-1">Success Title</h4>
        <p class="text-sm text-text-secondary">Message...</p>
    </div>
</div>
```

#### Warning
```html
<div class="border border-accent-amber/30 bg-accent-amber/5 rounded-xl p-4 flex items-start gap-4">
    <div class="w-8 h-8 rounded-lg bg-accent-amber/20 flex items-center justify-center flex-shrink-0">
        <span class="text-accent-amber">!</span>
    </div>
    <div>
        <h4 class="font-medium text-accent-amber mb-1">Warning Title</h4>
        <p class="text-sm text-text-secondary">Message...</p>
    </div>
</div>
```

#### Error
```html
<div class="border border-accent-red/30 bg-accent-red/5 rounded-xl p-4 flex items-start gap-4">
    <div class="w-8 h-8 rounded-lg bg-accent-red/20 flex items-center justify-center flex-shrink-0">
        <span class="text-accent-red">✕</span>
    </div>
    <div>
        <h4 class="font-medium text-accent-red mb-1">Error Title</h4>
        <p class="text-sm text-text-secondary">Message...</p>
    </div>
</div>
```

---

### 7. Flow Diagram

```html
<div class="flex items-center justify-between">
    <!-- Step -->
    <div class="text-center">
        <div class="w-16 h-16 rounded-xl bg-surface-3 border border-accent-green/50
                    flex items-center justify-center mb-3 mx-auto glow-green">
            <span class="text-2xl">📐</span>
        </div>
        <div class="text-sm font-medium">Step Name</div>
        <div class="text-xs text-text-muted">Description</div>
    </div>

    <!-- Connector -->
    <div class="flex-1 mx-4 flow-line"></div>

    <!-- Next Step... -->
</div>
```

---

### 8. Data Table

```html
<div class="border border-border-default rounded-xl overflow-hidden">
    <table class="w-full text-sm">
        <thead class="bg-surface-3">
            <tr>
                <th class="text-left p-4 font-medium text-text-muted">Column</th>
                <th class="text-left p-4 font-medium text-text-muted">Column</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
            <tr class="hover:bg-surface-3 transition-colors">
                <td class="p-4 font-mono text-accent-green">Value</td>
                <td class="p-4 text-text-secondary">Description</td>
            </tr>
        </tbody>
    </table>
</div>
```

---

### 9. Progress / Mini Chart

```html
<div class="flex items-end gap-1 h-16">
    <div class="w-full bg-accent-green/20 rounded-t" style="height: 85%">
        <div class="bg-accent-green rounded-t h-full"></div>
    </div>
    <div class="w-full bg-accent-amber/20 rounded-t" style="height: 12%">
        <div class="bg-accent-amber rounded-t h-full"></div>
    </div>
    <div class="w-full bg-surface-4 rounded-t" style="height: 3%"></div>
</div>
<div class="flex justify-between text-xs text-text-muted mt-2">
    <span>Label 1</span>
    <span>Label 2</span>
    <span>Label 3</span>
</div>
```

---

### 10. Live Indicator

```html
<div class="flex items-center gap-2">
    <span class="w-2 h-2 bg-accent-green rounded-full pulse-dot"></span>
    <span class="text-accent-green text-xs">System Active</span>
</div>
```

---

## CSS Utilities

### Required Styles

```css
/* Smooth card hover */
.card-hover {
    transition: all 0.2s ease-in-out;
}
.card-hover:hover {
    border-color: #555555;
    transform: translateY(-2px);
}

/* Gradient text for hero */
.gradient-text {
    background: linear-gradient(135deg, #FFFFFF 0%, #888888 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

/* Glow effects */
.glow-green { box-shadow: 0 0 20px rgba(34, 197, 94, 0.2); }
.glow-red { box-shadow: 0 0 20px rgba(239, 68, 68, 0.2); }
.glow-blue { box-shadow: 0 0 20px rgba(59, 130, 246, 0.2); }

/* Code block background */
.code-block {
    background: linear-gradient(135deg, #0A0A0A 0%, #111111 100%);
    border: 1px solid #333333;
}

/* Flow connector */
.flow-line {
    background: linear-gradient(90deg, transparent 0%, #333333 50%, transparent 100%);
    height: 1px;
}

/* Pulse animation */
@keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
.pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #111111; }
::-webkit-scrollbar-thumb { background: #333333; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #555555; }
```

---

## Grid Layouts

### Bento Grid (Default)

```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <!-- Cards here -->
</div>
```

### Two Column

```html
<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <!-- Cards here -->
</div>
```

### Sidebar Layout

```html
<div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
    <aside class="lg:col-span-1"><!-- Sidebar --></aside>
    <main class="lg:col-span-3"><!-- Content --></main>
</div>
```

---

## Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Default | `<640px` | Mobile - single column |
| `md` | `≥768px` | Tablet - 2 columns |
| `lg` | `≥1024px` | Desktop - 3 columns |
| `xl` | `≥1280px` | Wide desktop |

---

## Implementation Notes

1. **Font Loading**: Include Inter and JetBrains Mono from Google Fonts
2. **Dark Mode**: Use `class="dark"` on `<html>` element
3. **Tailwind**: Configure custom colors in `tailwind.config`
4. **Accessibility**: Maintain 4.5:1 contrast ratio for text
5. **Performance**: Lazy load images, use CSS for animations

---

## File Reference

| File | Purpose |
|------|---------|
| `operational-intelligence-template.html` | Complete page template |
| `operational-intelligence-components.md` | This component library |

---

*MONOLITH Designer Workspace v2.0 - Operational Intelligence Design System*
