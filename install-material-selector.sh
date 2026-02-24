#!/bin/bash

# ============================================
# IIMOS Workspace - Material Selector Auto-Install
# ============================================
# This script automatically installs and configures
# the Material Selector component with Expandable Screen
# ============================================

set -e  # Exit on error

echo "🚀 IIMOS Material Selector Auto-Install"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# Step 1: Detect Package Manager
# ============================================
echo -e "${BLUE}[1/7]${NC} Detecting package manager..."

if command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
    PKG_ADD="pnpm add"
    PKG_DLX="pnpm dlx"
elif command -v yarn &> /dev/null; then
    PKG_MANAGER="yarn"
    PKG_ADD="yarn add"
    PKG_DLX="yarn dlx"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    PKG_ADD="npm install"
    PKG_DLX="npx"
else
    echo -e "${RED}❌ No package manager found (npm, yarn, or pnpm)${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Using: $PKG_MANAGER"
echo ""

# ============================================
# Step 2: Check if in correct directory
# ============================================
echo -e "${BLUE}[2/7]${NC} Checking project structure..."

if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found. Please run this script from project root.${NC}"
    exit 1
fi

if [ ! -d "src" ]; then
    echo -e "${RED}❌ src/ directory not found.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Project structure valid"
echo ""

# ============================================
# Step 3: Create directory structure
# ============================================
echo -e "${BLUE}[3/7]${NC} Creating directory structure..."

mkdir -p src/components/ui
mkdir -p src/components/icons
mkdir -p src/components/layout
mkdir -p public/textures/wood

echo -e "${GREEN}✓${NC} Directories created"
echo ""

# ============================================
# Step 4: Install dependencies
# ============================================
echo -e "${BLUE}[4/7]${NC} Installing dependencies..."

# Check if framer-motion exists
if ! grep -q "framer-motion" package.json; then
    echo "  Installing framer-motion..."
    $PKG_ADD framer-motion
else
    echo "  framer-motion already installed"
fi

# Check if lucide-react exists
if ! grep -q "lucide-react" package.json; then
    echo "  Installing lucide-react..."
    $PKG_ADD lucide-react
else
    echo "  lucide-react already installed"
fi

echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# ============================================
# Step 5: Install Expandable Screen from Cult UI
# ============================================
echo -e "${BLUE}[5/7]${NC} Installing Expandable Screen component..."

$PKG_DLX shadcn@latest add https://cult-ui.com/r/expandable-screen.json -y

if [ -f "src/components/ui/expandable-screen.tsx" ]; then
    echo -e "${GREEN}✓${NC} Expandable Screen installed"
else
    echo -e "${YELLOW}⚠${NC} Expandable Screen may need manual installation"
    echo "  Run: $PKG_DLX shadcn@latest add https://cult-ui.com/r/expandable-screen.json"
fi

echo ""

# ============================================
# Step 6: Copy component files
# ============================================
echo -e "${BLUE}[6/7]${NC} Copying component files..."

# Check if files exist in current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/MaterialIcons.tsx" ]; then
    cp "$SCRIPT_DIR/MaterialIcons.tsx" src/components/icons/
    echo -e "${GREEN}✓${NC} MaterialIcons.tsx copied"
else
    echo -e "${YELLOW}⚠${NC} MaterialIcons.tsx not found in script directory"
    echo "  Please copy manually to: src/components/icons/"
fi

if [ -f "$SCRIPT_DIR/MaterialSelector.tsx" ]; then
    cp "$SCRIPT_DIR/MaterialSelector.tsx" src/components/ui/
    
    # Update imports in MaterialSelector.tsx
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' 's|// import {|import {|g' src/components/ui/MaterialSelector.tsx
        sed -i '' 's|//   ExpandableScreen,|  ExpandableScreen,|g' src/components/ui/MaterialSelector.tsx
        sed -i '' 's|//   ExpandableScreenTrigger,|  ExpandableScreenTrigger,|g' src/components/ui/MaterialSelector.tsx
        sed -i '' 's|//   ExpandableScreenContent,|  ExpandableScreenContent,|g' src/components/ui/MaterialSelector.tsx
        sed -i '' 's|// } from|} from|g' src/components/ui/MaterialSelector.tsx
        sed -i '' '/const ExpandableScreen = /d' src/components/ui/MaterialSelector.tsx
        sed -i '' '/const ExpandableScreenTrigger = /d' src/components/ui/MaterialSelector.tsx
        sed -i '' '/const ExpandableScreenContent = /d' src/components/ui/MaterialSelector.tsx
    else
        # Linux
        sed -i 's|// import {|import {|g' src/components/ui/MaterialSelector.tsx
        sed -i 's|//   ExpandableScreen,|  ExpandableScreen,|g' src/components/ui/MaterialSelector.tsx
        sed -i 's|//   ExpandableScreenTrigger,|  ExpandableScreenTrigger,|g' src/components/ui/MaterialSelector.tsx
        sed -i 's|//   ExpandableScreenContent,|  ExpandableScreenContent,|g' src/components/ui/MaterialSelector.tsx
        sed -i 's|// } from|} from|g' src/components/ui/MaterialSelector.tsx
        sed -i '/const ExpandableScreen = /d' src/components/ui/MaterialSelector.tsx
        sed -i '/const ExpandableScreenTrigger = /d' src/components/ui/MaterialSelector.tsx
        sed -i '/const ExpandableScreenContent = /d' src/components/ui/MaterialSelector.tsx
    fi
    
    echo -e "${GREEN}✓${NC} MaterialSelector.tsx copied and configured"
else
    echo -e "${YELLOW}⚠${NC} MaterialSelector.tsx not found in script directory"
    echo "  Please copy manually to: src/components/ui/"
fi

if [ -f "$SCRIPT_DIR/DesignerIntentPanel-with-MaterialSelector.tsx" ]; then
    # Backup existing file if it exists
    if [ -f "src/components/layout/DesignerIntentPanel.tsx" ]; then
        cp src/components/layout/DesignerIntentPanel.tsx src/components/layout/DesignerIntentPanel.tsx.backup
        echo -e "${YELLOW}⚠${NC} Backed up existing DesignerIntentPanel.tsx"
    fi
    
    cp "$SCRIPT_DIR/DesignerIntentPanel-with-MaterialSelector.tsx" src/components/layout/DesignerIntentPanel.tsx
    echo -e "${GREEN}✓${NC} DesignerIntentPanel.tsx updated"
else
    echo -e "${YELLOW}⚠${NC} DesignerIntentPanel-with-MaterialSelector.tsx not found"
    echo "  Please copy manually to: src/components/layout/DesignerIntentPanel.tsx"
fi

echo ""

# ============================================
# Step 7: Summary
# ============================================
echo -e "${BLUE}[7/7]${NC} Installation Summary"
echo "========================================"
echo ""
echo -e "${GREEN}✓${NC} Package manager: $PKG_MANAGER"
echo -e "${GREEN}✓${NC} Dependencies installed"
echo -e "${GREEN}✓${NC} Directory structure created"
echo -e "${GREEN}✓${NC} Components copied"
echo ""

# ============================================
# Next Steps
# ============================================
echo -e "${BLUE}📋 Next Steps:${NC}"
echo ""
echo "1. Add material thumbnails to useCabinetStore.ts:"
echo "   Run: cat update-store-thumbnails.sh | bash"
echo ""
echo "2. Start development server:"
echo "   $PKG_MANAGER dev"
echo ""
echo "3. Test Material Selector:"
echo "   - Go to Materials tab"
echo "   - Click on any material card"
echo "   - Should expand to full screen"
echo ""

# ============================================
# Create thumbnail update script
# ============================================
echo -e "${BLUE}📝 Creating thumbnail update helper script...${NC}"

cat > update-store-thumbnails.sh << 'THUMBNAIL_SCRIPT'
#!/bin/bash

# Helper script to show how to add thumbnails to useCabinetStore.ts

echo "📝 Add these thumbnails to your material definitions in useCabinetStore.ts:"
echo ""
echo "Example for Surface Materials:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat << 'EOF'

surfaceMaterials: {
  'surf-hpl-grey-oak': {
    id: 'surf-hpl-grey-oak',
    name: 'Grey Oak',
    type: 'HPL',
    texture: '/textures/wood/grey-oak.jpg',
    thumbnail: '/textures/wood/grey-oak.jpg', // ← Add this line
    thickness: 0.8,
    cost: 850,
    description: 'High-pressure laminate with grey oak wood grain pattern',
    manufacturer: 'EGGER',
  },
  'surf-hpl-black-oak': {
    id: 'surf-hpl-black-oak',
    name: 'Black Oak',
    type: 'HPL',
    texture: '/textures/wood/black-oak.jpg',
    thumbnail: '/textures/wood/black-oak.jpg', // ← Add this line
    thickness: 0.8,
    cost: 850,
    description: 'High-pressure laminate with black oak wood grain pattern',
    manufacturer: 'EGGER',
  },
  // ... repeat for all materials
}

EOF
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Tip: Use the same path as 'texture' for 'thumbnail'"
echo ""

THUMBNAIL_SCRIPT

chmod +x update-store-thumbnails.sh

echo -e "${GREEN}✓${NC} Created update-store-thumbnails.sh"
echo ""

# ============================================
# Final message
# ============================================
echo -e "${GREEN}🎉 Installation Complete!${NC}"
echo ""
echo "Run your dev server and test the Material Selector!"
echo ""
