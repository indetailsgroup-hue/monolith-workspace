# 🚀 Material Selector - Complete Installation Guide

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Install (Automated)](#quick-install-automated)
3. [Manual Install](#manual-install)
4. [Post-Installation](#post-installation)
5. [Troubleshooting](#troubleshooting)

---

## 1️⃣ Prerequisites

### Required Software
- Node.js (v18 or higher)
- Package manager: npm, yarn, or pnpm
- Git (optional)

### Required Project Files
- ✅ Existing MONOLITH Workspace project
- ✅ React + TypeScript + Vite setup
- ✅ TailwindCSS configured
- ✅ Framer Motion installed (will be auto-installed)

---

## 2️⃣ Quick Install (Automated)

### For Mac/Linux Users

1. **Download all files** from the provided ZIP
2. **Extract** to a temporary folder
3. **Navigate** to the extracted folder in Terminal:
   ```bash
   cd /path/to/extracted/folder
   ```
4. **Make script executable**:
   ```bash
   chmod +x install-material-selector.sh
   ```
5. **Run installation script**:
   ```bash
   ./install-material-selector.sh
   ```

### For Windows Users

1. **Download all files** from the provided ZIP
2. **Extract** to a temporary folder
3. **Open Command Prompt** in the extracted folder
4. **Run installation script**:
   ```cmd
   install-material-selector.bat
   ```

5. **Manual step required** (Windows only):
   - Open `src/components/ui/MaterialSelector.tsx`
   - Find lines ~18-25 (the commented imports)
   - Remove the `//` comments
   - Delete the 3 placeholder `const` lines

---

## 3️⃣ Manual Install

If automated scripts don't work, follow these steps:

### Step 1: Install Expandable Screen Component

```bash
# Using pnpm (recommended)
pnpm dlx shadcn@latest add https://cult-ui.com/r/expandable-screen.json

# Using npm
npx shadcn@latest add https://cult-ui.com/r/expandable-screen.json

# Using yarn
yarn dlx shadcn@latest add https://cult-ui.com/r/expandable-screen.json
```

**Expected result:** 
- Creates `src/components/ui/expandable-screen.tsx`
- Installs `framer-motion` if not present

### Step 2: Install Dependencies

```bash
# Install required packages
npm install framer-motion lucide-react
# or
pnpm add framer-motion lucide-react
# or
yarn add framer-motion lucide-react
```

### Step 3: Create Directory Structure

```bash
mkdir -p src/components/ui
mkdir -p src/components/icons
mkdir -p src/components/layout
mkdir -p public/textures/wood
mkdir -p public/textures/core
mkdir -p public/textures/solid
mkdir -p public/textures/edge
```

### Step 4: Copy Component Files

Copy these files to your project:

| Source File | Destination |
|-------------|-------------|
| `MaterialIcons.tsx` | `src/components/icons/MaterialIcons.tsx` |
| `MaterialSelector.tsx` | `src/components/ui/MaterialSelector.tsx` |
| `DesignerIntentPanel-with-MaterialSelector.tsx` | `src/components/layout/DesignerIntentPanel.tsx` |

### Step 5: Update MaterialSelector.tsx Imports

Open `src/components/ui/MaterialSelector.tsx` and edit:

**Before (lines ~18-30):**
```typescript
// Uncomment these imports after running: pnpm dlx shadcn@latest add ...
// import {
//   ExpandableScreen,
//   ExpandableScreenTrigger,
//   ExpandableScreenContent,
// } from '@/components/ui/expandable-screen';

// Temporary placeholder types (remove when actual component is installed)
const ExpandableScreen = ({ children, layoutId, triggerRadius, contentRadius }: any) => <div>{children}</div>;
const ExpandableScreenTrigger = ({ children }: any) => <div>{children}</div>;
const ExpandableScreenContent = ({ children }: any) => <div className="hidden">{children}</div>;
```

**After:**
```typescript
import {
  ExpandableScreen,
  ExpandableScreenTrigger,
  ExpandableScreenContent,
} from '@/components/ui/expandable-screen';
```

---

## 4️⃣ Post-Installation

### Add Material Thumbnails

Open `src/core/store/useCabinetStore.ts` and add `thumbnail` property to all materials:

**Example for Surface Materials:**

```typescript
surfaceMaterials: {
  'surf-hpl-grey-oak': {
    id: 'surf-hpl-grey-oak',
    name: 'Grey Oak',
    type: 'HPL',
    texture: '/textures/wood/grey-oak.jpg',
    thumbnail: '/textures/wood/grey-oak.jpg', // ← ADD THIS LINE
    thickness: 0.8,
    cost: 850,
    description: 'Contemporary grey oak with balanced grain',
    manufacturer: 'EGGER',
  },
  // ... repeat for all materials
}
```

**Quick Copy-Paste:** See `useCabinetStore-thumbnails-update.ts` for complete code

### Verify Installation

1. **Check file structure:**
   ```bash
   ls -la src/components/ui/expandable-screen.tsx
   ls -la src/components/ui/MaterialSelector.tsx
   ls -la src/components/icons/MaterialIcons.tsx
   ```

2. **Check imports:**
   ```bash
   grep "ExpandableScreen" src/components/ui/MaterialSelector.tsx
   # Should show: import { ExpandableScreen, ... } from ...
   # Should NOT show: const ExpandableScreen = ...
   ```

3. **Start dev server:**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

4. **Test in browser:**
   - Navigate to Materials tab
   - Click on any material card
   - Should expand to full screen with smooth animation
   - Select a material → checkmark appears
   - Click Apply → screen closes → material updates

---

## 5️⃣ Troubleshooting

### Error: "Cannot find module 'expandable-screen'"

**Cause:** Expandable Screen component not installed

**Solution:**
```bash
pnpm dlx shadcn@latest add https://cult-ui.com/r/expandable-screen.json
```

Verify installation:
```bash
ls src/components/ui/expandable-screen.tsx
```

---

### Error: "Cannot find module '@/components/icons/MaterialIcons'"

**Cause:** MaterialIcons.tsx in wrong location or not copied

**Solution:**
```bash
# Check if file exists
ls src/components/icons/MaterialIcons.tsx

# If missing, copy it
cp MaterialIcons.tsx src/components/icons/
```

---

### Error: Placeholder components still active

**Symptom:** Screen doesn't expand, no animation

**Cause:** Haven't updated MaterialSelector.tsx imports

**Solution:** 
1. Open `src/components/ui/MaterialSelector.tsx`
2. Uncomment the real imports (lines ~18-22)
3. Delete the 3 placeholder `const` lines (~24-26)
4. Save and restart dev server

---

### Warning: Images/thumbnails not showing

**Cause:** Missing `thumbnail` property or wrong path

**Solution:**
1. Add `thumbnail` property to all materials in `useCabinetStore.ts`
2. Use same value as `texture` property
3. Verify image files exist in `public/textures/`

Example fix:
```typescript
// Before
texture: '/textures/wood/grey-oak.jpg',

// After
texture: '/textures/wood/grey-oak.jpg',
thumbnail: '/textures/wood/grey-oak.jpg', // ← Add this
```

---

### Error: Animation stutters or doesn't work

**Cause:** Missing `layoutId` or duplicate IDs

**Solution:** 
Each MaterialSelector must have unique `layoutId`:
```typescript
// Correct
<MaterialSelector
  layoutId="material-selector-core-structure"  // ✅ Unique
  ...
/>

<MaterialSelector
  layoutId="material-selector-surface-finish"  // ✅ Unique
  ...
/>
```

---

### Error: TypeScript errors in MaterialSelector

**Cause:** Expandable Screen types not recognized

**Solution:**
1. Restart TypeScript server in VS Code: `Cmd+Shift+P` → "TypeScript: Restart TS Server"
2. Check that `expandable-screen.tsx` exists
3. Verify imports are correct

---

## 📚 Additional Resources

### File Locations Reference

```
your-project/
├── public/
│   └── textures/
│       ├── wood/          (17 wood texture images)
│       ├── core/          (particle board, MDF, etc.)
│       ├── solid/         (white, black, grey)
│       └── edge/          (aluminum, etc.)
├── src/
│   ├── components/
│   │   ├── icons/
│   │   │   └── MaterialIcons.tsx
│   │   ├── ui/
│   │   │   ├── expandable-screen.tsx  (from Cult UI)
│   │   │   └── MaterialSelector.tsx
│   │   └── layout/
│   │       └── DesignerIntentPanel.tsx
│   └── core/
│       └── store/
│           └── useCabinetStore.ts     (update with thumbnails)
```

### Dependencies Check

```bash
# Check installed versions
npm list framer-motion
npm list lucide-react

# Should show:
# framer-motion@11.x.x or higher
# lucide-react@0.400.x or higher
```

### Clean Install (if all else fails)

```bash
# 1. Remove node_modules
rm -rf node_modules

# 2. Remove package-lock
rm package-lock.json
# or
rm pnpm-lock.yaml
# or
rm yarn.lock

# 3. Reinstall everything
npm install
# or
pnpm install
# or
yarn install

# 4. Re-run installation script
./install-material-selector.sh
```

---

## ✅ Installation Checklist

Use this checklist to verify everything is set up correctly:

- [ ] Expandable Screen component installed (`src/components/ui/expandable-screen.tsx` exists)
- [ ] Dependencies installed (`framer-motion`, `lucide-react`)
- [ ] Directory structure created (`ui/`, `icons/`, `layout/`)
- [ ] `MaterialIcons.tsx` copied to `src/components/icons/`
- [ ] `MaterialSelector.tsx` copied to `src/components/ui/`
- [ ] Imports in `MaterialSelector.tsx` uncommented
- [ ] Placeholder components removed from `MaterialSelector.tsx`
- [ ] `DesignerIntentPanel.tsx` updated with MaterialSelector usage
- [ ] Material thumbnails added to `useCabinetStore.ts`
- [ ] Dev server starts without errors
- [ ] Can navigate to Materials tab
- [ ] Clicking material card expands to full screen
- [ ] Material selection works
- [ ] Apply button closes screen and updates material

---

## 🎯 Next Steps After Installation

1. **Customize Colors**
   - Edit `colorThemes` in `MaterialSelector.tsx`
   - Change Orange/Blue/Cyan to your brand colors

2. **Add More Materials**
   - Add new entries to `useCabinetStore.ts`
   - Include `thumbnail` property for each

3. **Customize Layout**
   - Adjust grid columns in `MaterialSelector.tsx`
   - Change card sizes, spacing, etc.

4. **Add Features**
   - Material search/filter
   - Favorites system
   - Material comparison
   - Custom material upload

---

## 💬 Support

If you encounter issues not covered here:

1. Check browser console for errors
2. Verify all files are in correct locations
3. Check that imports are correct
4. Restart dev server
5. Try clean install

---

**Installation complete!** 🎉

You should now have a fully functional Material Selector with smooth expandable screen animations!
