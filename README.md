# 🎨 MONOLITH Material Selector - Ready to Copy!

## 📦 What's This?

This folder contains **everything you need** for the Material Selector feature.
Just copy the entire contents to your MONOLITH Workspace project!

---

## 🚀 Installation (3 Easy Steps!)

### Step 1: Copy Everything

**Copy all files from this folder** to your project:

```
monolith-material-selector-ready/  →  C:\Projects\monolith-workspace\
```

**What will be copied:**
- ✅ `tsconfig.json` - TypeScript config with import alias
- ✅ `vite.config.ts` - Vite config with path alias  
- ✅ `components.json` - Shadcn UI config
- ✅ `src/components/ui/expandable-screen.tsx` - Cult UI component
- ✅ `src/components/ui/MaterialSelector.tsx` - Main component
- ✅ `src/components/icons/MaterialIcons.tsx` - Custom icons
- ✅ `src/components/layout/DesignerIntentPanel.tsx` - Updated panel
- ✅ `src/core/store/useCabinetStore-thumbnails-update.ts` - Material defs

**IMPORTANT:** 
- If asked to replace files → Click **"Yes to All"**
- Backup your original `tsconfig.json` and `vite.config.ts` if needed

---

### Step 2: Install Dependencies

Open terminal in your project and run:

```cmd
npm install framer-motion lucide-react @types/node
```

Or if using pnpm:

```cmd
pnpm add framer-motion lucide-react @types/node
```

---

### Step 3: Add Material Thumbnails

Open: `src/core/store/useCabinetStore.ts`

Copy material definitions from: `src/core/store/useCabinetStore-thumbnails-update.ts`

**Add `thumbnail` property to each material:**

```typescript
// Example
'surf-hpl-grey-oak': {
  id: 'surf-hpl-grey-oak',
  name: 'Grey Oak',
  type: 'HPL',
  texture: '/textures/wood/grey-oak.jpg',
  thumbnail: '/textures/wood/grey-oak.jpg', // ← Add this line
  thickness: 0.8,
  cost: 850,
},
```

**Repeat for all materials** (use same value as `texture`)

---

## ✅ That's It!

Start your dev server:

```cmd
npm run dev
```

Navigate to **Materials** tab and click any material card!

---

## 📁 File Structure After Copy

```
C:\Projects\monolith-workspace\
├── tsconfig.json                  ← REPLACED (with import alias)
├── vite.config.ts                 ← REPLACED (with path alias)
├── components.json                ← NEW (Shadcn config)
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── expandable-screen.tsx    ← NEW
│   │   │   └── MaterialSelector.tsx     ← NEW
│   │   ├── icons/
│   │   │   └── MaterialIcons.tsx        ← NEW
│   │   └── layout/
│   │       └── DesignerIntentPanel.tsx  ← REPLACED
│   └── core/
│       └── store/
│           ├── useCabinetStore.ts       ← UPDATE (add thumbnails)
│           └── useCabinetStore-thumbnails-update.ts ← REFERENCE
```

---

## 🎯 Expected Result

After installation:

1. **Materials Tab** shows 3 cards:
   - 🧊 Core Structure (Orange)
   - 🎨 Surface Finish (Blue)  
   - 📏 Edge Banding (Cyan)

2. **Click any card** → Smooth expansion to full screen

3. **Material Grid** with texture images

4. **Select material** → Checkmark appears

5. **Properties panel** shows details

6. **Click Apply** → Screen closes → Material updates

---

## 🐛 Troubleshooting

### Error: "Cannot resolve '@/components/...'"

**Cause:** TypeScript not recognizing alias

**Fix:** 
1. Restart VS Code
2. Reload TypeScript: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"

---

### Error: "Module not found: framer-motion"

**Cause:** Dependencies not installed

**Fix:**
```cmd
npm install framer-motion lucide-react @types/node
```

---

### Screen doesn't expand

**Cause:** MaterialSelector.tsx still has placeholder components

**Fix:** Check that `MaterialSelector.tsx` has:
```typescript
import {
  ExpandableScreen,
  ExpandableScreenTrigger,
  ExpandableScreenContent,
} from '@/components/ui/expandable-screen';
```

NOT:
```typescript
const ExpandableScreen = ...
```

(This should already be fixed in the copy!)

---

### Images don't show

**Cause:** Missing `thumbnail` property in materials

**Fix:** Add `thumbnail` to all materials in `useCabinetStore.ts` (Step 3)

---

## 📚 What's Included

### Components
- **MaterialSelector.tsx** - Expandable screen material picker
- **MaterialIcons.tsx** - Custom SVG icons (Core/Surface/Edge)
- **expandable-screen.tsx** - Cult UI expandable component
- **DesignerIntentPanel.tsx** - Updated with MaterialSelector

### Configuration
- **tsconfig.json** - TypeScript with `@/*` alias
- **vite.config.ts** - Vite with path resolution
- **components.json** - Shadcn UI configuration

### Reference
- **useCabinetStore-thumbnails-update.ts** - Material thumbnail examples

---

## 🎨 Features

✨ **Smooth Animations**
- Card morphs to full screen
- Framer Motion spring physics
- No jarring transitions

🎯 **Visual Selection**
- Texture preview grid
- Hover effects (zoom + overlay)
- Color-coded borders

📊 **Material Properties**
- Real-time info display
- Density, cost, manufacturer
- Apply mode (Selected/All)

📱 **Responsive**
- Mobile: 2 columns
- Tablet: 3 columns
- Desktop: 4-5 columns

---

## ⚙️ Customization

### Change Colors

Edit `MaterialSelector.tsx`:

```typescript
const colorThemes = {
  orange: {
    button: 'bg-orange-500 hover:bg-orange-600', // ← Change here
    // ...
  }
}
```

### Adjust Grid

```typescript
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
//                    ↑ Mobile   ↑ Tablet   ↑ Desktop
```

---

## 💡 Need Help?

1. Make sure you copied ALL files
2. Check that dependencies are installed
3. Restart VS Code / TypeScript server
4. Check browser console for errors

---

**Ready to use!** 🎉

Everything is pre-configured and ready to copy-paste!
