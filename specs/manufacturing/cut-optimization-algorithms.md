# Cut Optimization Algorithms
# อัลกอริทึมการจัดเรียงการตัดวัสดุ

**Version:** 1.0
**Last Updated:** 2026-01-10
**Status:** Technical Reference
**Scope:** Sheet Material Optimization for CNC Cutting

---

> **Cross-References:**
> - [Formula Reference](../reference/formula-reference.md) - Kerf width clarification (§2)
> - [Cross-Reference Index](../reference/cross-reference-index.md) - Document navigation
> - [Parametric Cabinet Calculations](../technical/parametric-cabinet-calculations.md) - Cutlist source
> - [Kerf Bending Algorithms](./kerf-bending-algorithms.md) - Curved panel waste

---

## บทนำ (Introduction)

เอกสารนี้อธิบาย **อัลกอริทึมการจัดเรียงการตัดแผ่นวัสดุ (Cut Optimization / Nesting)** สำหรับการผลิตเฟอร์นิเจอร์ เป้าหมายคือการลดเศษวัสดุ (waste) ให้น้อยที่สุด พร้อมทั้งคำนึงถึงข้อจำกัดของเครื่อง CNC

### วัตถุประสงค์ (Objectives)

1. **Minimize Waste**: ลดเศษวัสดุให้เหลือน้อยที่สุด
2. **Optimize Cutting Path**: จัดเส้นทางการตัดให้มีประสิทธิภาพ
3. **Grain Direction Compliance**: รักษาทิศทางลายไม้
4. **Production Efficiency**: ลดเวลาตัดและจำนวนครั้งที่หมุนแผ่น

---

## ส่วนที่ 1: ปัญหาการตัดวัสดุ (Cutting Stock Problem)

### 1.1 ประเภทปัญหา

```typescript
// 2D Bin Packing Problem - NP-Hard
type CuttingProblemType =
  | 'guillotine'     // ตัดทะลุเต็มแผ่น (CNC Panel Saw)
  | 'non_guillotine' // ตัดอิสระ (CNC Router)
  | 'nested'         // จัดเรียงรูปทรงไม่เป็นสี่เหลี่ยม
  | 'strip_packing'; // จัดเรียงในแถบ

interface CuttingStockProblem {
  type: CuttingProblemType;
  stockSheets: StockSheet[];          // แผ่นวัสดุที่มี
  requiredParts: CutPart[];           // ชิ้นส่วนที่ต้องตัด
  constraints: CuttingConstraints;     // ข้อจำกัด
}
```

### 1.2 ข้อจำกัดการตัด (Cutting Constraints)

```typescript
interface CuttingConstraints {
  // ระยะขอบขั้นต่ำ (Edge Margin)
  edgeMargin: number;            // 10-15mm จากขอบแผ่น

  // ความกว้างรอยตัด (Saw Kerf)
  sawKerf: number;               // 3-4mm สำหรับ Panel Saw
                                 // 6-10mm สำหรับ CNC Router

  // ทิศทางลายไม้ (Grain Direction)
  respectGrainDirection: boolean;

  // การหมุนชิ้นงาน
  allowRotation: boolean;        // อนุญาตหมุน 90°
  rotationOptions: (0 | 90 | 180 | 270)[];

  // ข้อจำกัด Guillotine
  guillotineOnly: boolean;       // ตัดทะลุเท่านั้น
  maxCutDepth: number;           // ความลึกการตัดสูงสุด

  // การจัดกลุ่ม
  groupByMaterial: boolean;
  groupByThickness: boolean;
  groupByEdgeBanding: boolean;
}

const DEFAULT_CONSTRAINTS: CuttingConstraints = {
  edgeMargin: 10,
  sawKerf: 4,
  respectGrainDirection: true,
  allowRotation: false,
  rotationOptions: [0, 90],
  guillotineOnly: true,
  maxCutDepth: 3,
  groupByMaterial: true,
  groupByThickness: true,
  groupByEdgeBanding: true
};
```

### 1.3 โครงสร้างข้อมูล (Data Structures)

```typescript
interface StockSheet {
  id: string;
  material: string;              // 'MDF', 'Plywood', 'Melamine'
  thickness: number;             // mm
  width: number;                 // mm (แนวสั้นของแผ่น)
  length: number;                // mm (แนวยาว/ลายไม้)
  quantity: number;              // จำนวนแผ่นที่มี
  cost: number;                  // ราคาต่อแผ่น
  grainDirection: 'length' | 'width' | 'none';
}

interface CutPart {
  id: string;
  name: string;                  // ชื่อชิ้นส่วน
  projectId: string;             // รหัสโปรเจค
  cabinetId: string;             // รหัสตู้
  width: number;                 // mm
  length: number;                // mm
  quantity: number;
  material: string;
  thickness: number;
  grainRequired: boolean;        // ต้องรักษาลายไม้
  grainDirection: 'length' | 'width';
  edgeBanding: EdgeBandingSpec;
  priority: number;              // ลำดับความสำคัญ
}

interface EdgeBandingSpec {
  top: number;                   // ความหนา edge (0 = ไม่มี)
  bottom: number;
  left: number;
  right: number;
}

interface PlacedPart {
  part: CutPart;
  x: number;                     // ตำแหน่ง X บนแผ่น
  y: number;                     // ตำแหน่ง Y บนแผ่น
  rotated: boolean;              // หมุน 90° หรือไม่
  sheetIndex: number;            // อยู่บนแผ่นที่เท่าไหร่
}

interface CuttingLayout {
  sheets: SheetLayout[];
  totalWaste: number;
  wastePercentage: number;
  totalCost: number;
  cutSequence: CutInstruction[];
}

interface SheetLayout {
  sheet: StockSheet;
  placements: PlacedPart[];
  usedArea: number;
  wasteArea: number;
  efficiency: number;            // 0-1
}
```

---

## ส่วนที่ 2: อัลกอริทึม Guillotine Cut

### 2.1 หลักการ Guillotine Cut

Guillotine Cut คือการตัดที่ต้องตัดทะลุเต็มแผ่น (edge-to-edge) ซึ่งเป็นข้อจำกัดของเครื่อง Panel Saw

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌──────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │    A     │  │       B       │  │      C      │  │
│  │          │  │               │  │             │  │
│  └──────────┘  └───────────────┘  └─────────────┘  │
│─────────────────────────────────────────────────────│  ← Cut 1 (Horizontal)
│  ┌──────────────────┐  ┌────────────────────────┐  │
│  │        D         │  │          E             │  │
│  │                  │  │                        │  │
│  │                  │  │                        │  │
│  └──────────────────┘  └────────────────────────┘  │
│                        │                           │
│                        │ ← Cut 2 (Vertical)       │
└─────────────────────────────────────────────────────┘
```

### 2.2 Binary Tree Representation

```typescript
interface GuillotineNode {
  type: 'horizontal' | 'vertical' | 'leaf';
  x: number;
  y: number;
  width: number;
  height: number;
  cutPosition?: number;           // ตำแหน่งที่ตัด
  left?: GuillotineNode;          // ส่วนบน/ซ้าย
  right?: GuillotineNode;         // ส่วนล่าง/ขวา
  part?: CutPart;                 // ชิ้นส่วนที่วาง (ถ้าเป็น leaf)
  isWaste: boolean;               // เป็นเศษหรือไม่
}

class GuillotineTree {
  root: GuillotineNode;
  kerf: number;

  constructor(width: number, height: number, kerf: number = 4) {
    this.root = {
      type: 'leaf',
      x: 0,
      y: 0,
      width,
      height,
      isWaste: false
    };
    this.kerf = kerf;
  }

  // หา Leaf nodes ที่ยังว่าง
  findEmptyLeaves(): GuillotineNode[] {
    const leaves: GuillotineNode[] = [];
    this.traverseLeaves(this.root, (node) => {
      if (!node.part && !node.isWaste) {
        leaves.push(node);
      }
    });
    return leaves;
  }

  // ตรวจสอบว่าชิ้นส่วนใส่ใน node ได้หรือไม่
  canFit(node: GuillotineNode, part: CutPart, rotated: boolean): boolean {
    const partWidth = rotated ? part.length : part.width;
    const partLength = rotated ? part.width : part.length;

    return partWidth <= node.width && partLength <= node.height;
  }

  // วางชิ้นส่วนและแบ่ง node
  placePart(
    node: GuillotineNode,
    part: CutPart,
    rotated: boolean,
    splitDirection: 'horizontal' | 'vertical'
  ): void {
    const partWidth = rotated ? part.length : part.width;
    const partLength = rotated ? part.width : part.length;

    if (splitDirection === 'horizontal') {
      // ตัดแนวนอนก่อน
      node.type = 'horizontal';
      node.cutPosition = node.y + partLength + this.kerf;

      // ส่วนบน (มีชิ้นงาน)
      node.left = {
        type: 'leaf',
        x: node.x,
        y: node.y,
        width: node.width,
        height: partLength,
        isWaste: false
      };

      // แบ่งส่วนบนออกเป็น ชิ้นงาน + เศษขวา
      if (partWidth < node.width - this.kerf) {
        node.left.type = 'vertical';
        node.left.cutPosition = node.x + partWidth + this.kerf;
        node.left.left = {
          type: 'leaf',
          x: node.x,
          y: node.y,
          width: partWidth,
          height: partLength,
          part: part,
          isWaste: false
        };
        node.left.right = {
          type: 'leaf',
          x: node.x + partWidth + this.kerf,
          y: node.y,
          width: node.width - partWidth - this.kerf,
          height: partLength,
          isWaste: false
        };
      } else {
        node.left.part = part;
      }

      // ส่วนล่าง (ยังว่าง)
      node.right = {
        type: 'leaf',
        x: node.x,
        y: node.y + partLength + this.kerf,
        width: node.width,
        height: node.height - partLength - this.kerf,
        isWaste: false
      };
    } else {
      // ตัดแนวตั้งก่อน (คล้ายกันแต่สลับแกน)
      // ... implementation
    }
  }

  private traverseLeaves(
    node: GuillotineNode,
    callback: (node: GuillotineNode) => void
  ): void {
    if (node.type === 'leaf') {
      callback(node);
    } else {
      if (node.left) this.traverseLeaves(node.left, callback);
      if (node.right) this.traverseLeaves(node.right, callback);
    }
  }
}
```

### 2.3 Guillotine Packing Algorithm

```typescript
interface PackingResult {
  placements: PlacedPart[];
  tree: GuillotineTree;
  efficiency: number;
}

class GuillotinePacker {
  private constraints: CuttingConstraints;

  constructor(constraints: CuttingConstraints) {
    this.constraints = constraints;
  }

  pack(
    sheet: StockSheet,
    parts: CutPart[]
  ): PackingResult {
    // หักขอบแผ่น
    const usableWidth = sheet.width - (this.constraints.edgeMargin * 2);
    const usableHeight = sheet.length - (this.constraints.edgeMargin * 2);

    const tree = new GuillotineTree(
      usableWidth,
      usableHeight,
      this.constraints.sawKerf
    );

    const placements: PlacedPart[] = [];

    // เรียงชิ้นส่วนจากใหญ่ไปเล็ก (Decreasing Area First Fit)
    const sortedParts = [...parts].sort((a, b) => {
      return (b.width * b.length) - (a.width * a.length);
    });

    for (const part of sortedParts) {
      const placed = this.tryPlacePart(tree, part, sheet);
      if (placed) {
        placements.push(placed);
      }
    }

    const usedArea = placements.reduce(
      (sum, p) => sum + p.part.width * p.part.length,
      0
    );
    const totalArea = usableWidth * usableHeight;

    return {
      placements,
      tree,
      efficiency: usedArea / totalArea
    };
  }

  private tryPlacePart(
    tree: GuillotineTree,
    part: CutPart,
    sheet: StockSheet
  ): PlacedPart | null {
    const emptyLeaves = tree.findEmptyLeaves();

    // เรียง leaves จากเล็กไปใหญ่ (Best Fit)
    emptyLeaves.sort((a, b) => (a.width * a.height) - (b.width * b.height));

    for (const leaf of emptyLeaves) {
      // ลองวางแบบไม่หมุน
      if (this.canPlaceWithGrain(leaf, part, sheet, false)) {
        const splitDir = this.chooseSplitDirection(leaf, part, false);
        tree.placePart(leaf, part, false, splitDir);
        return {
          part,
          x: leaf.x + this.constraints.edgeMargin,
          y: leaf.y + this.constraints.edgeMargin,
          rotated: false,
          sheetIndex: 0
        };
      }

      // ลองหมุน 90° (ถ้าอนุญาต)
      if (this.constraints.allowRotation &&
          this.canPlaceWithGrain(leaf, part, sheet, true)) {
        const splitDir = this.chooseSplitDirection(leaf, part, true);
        tree.placePart(leaf, part, true, splitDir);
        return {
          part,
          x: leaf.x + this.constraints.edgeMargin,
          y: leaf.y + this.constraints.edgeMargin,
          rotated: true,
          sheetIndex: 0
        };
      }
    }

    return null;
  }

  private canPlaceWithGrain(
    leaf: GuillotineNode,
    part: CutPart,
    sheet: StockSheet,
    rotated: boolean
  ): boolean {
    // ตรวจสอบขนาด
    const partWidth = rotated ? part.length : part.width;
    const partLength = rotated ? part.width : part.length;

    if (partWidth > leaf.width || partLength > leaf.height) {
      return false;
    }

    // ตรวจสอบทิศทางลายไม้
    if (this.constraints.respectGrainDirection &&
        part.grainRequired &&
        sheet.grainDirection !== 'none') {

      const partGrain = rotated
        ? (part.grainDirection === 'length' ? 'width' : 'length')
        : part.grainDirection;

      if (partGrain !== sheet.grainDirection) {
        return false;
      }
    }

    return true;
  }

  private chooseSplitDirection(
    leaf: GuillotineNode,
    part: CutPart,
    rotated: boolean
  ): 'horizontal' | 'vertical' {
    const partWidth = rotated ? part.length : part.width;
    const partLength = rotated ? part.width : part.length;

    const wasteHorizontal = leaf.width * (leaf.height - partLength);
    const wasteVertical = (leaf.width - partWidth) * leaf.height;

    // เลือกทิศทางที่เหลือเศษน้อยกว่า
    return wasteHorizontal <= wasteVertical ? 'horizontal' : 'vertical';
  }
}
```

---

## ส่วนที่ 3: First Fit Decreasing (FFD) Algorithm

### 3.1 หลักการ FFD

```
Algorithm: First Fit Decreasing
1. เรียงชิ้นส่วนจากใหญ่ไปเล็ก
2. สำหรับแต่ละชิ้นส่วน:
   a. หา bin แรกที่ใส่ได้
   b. ถ้าไม่มี bin ที่ใส่ได้ → เปิด bin ใหม่
   c. วางชิ้นส่วนใน bin
```

```typescript
interface BinPackingResult {
  bins: SheetLayout[];
  unplacedParts: CutPart[];
  totalWaste: number;
  wastePercentage: number;
}

class FFDBinPacker {
  private constraints: CuttingConstraints;
  private packer: GuillotinePacker;

  constructor(constraints: CuttingConstraints) {
    this.constraints = constraints;
    this.packer = new GuillotinePacker(constraints);
  }

  pack(
    stockSheets: StockSheet[],
    parts: CutPart[]
  ): BinPackingResult {
    // จัดกลุ่มชิ้นส่วนตามวัสดุและความหนา
    const partGroups = this.groupParts(parts);
    const bins: SheetLayout[] = [];
    const unplacedParts: CutPart[] = [];

    for (const [key, groupParts] of partGroups) {
      // หา stock sheet ที่ตรงกับกลุ่มนี้
      const matchingSheets = stockSheets.filter(s =>
        s.material === groupParts[0].material &&
        s.thickness === groupParts[0].thickness
      );

      if (matchingSheets.length === 0) {
        unplacedParts.push(...groupParts);
        continue;
      }

      // เรียงจากใหญ่ไปเล็ก
      const sortedParts = [...groupParts].sort((a, b) =>
        (b.width * b.length * b.quantity) - (a.width * a.length * a.quantity)
      );

      // แตก quantity ออกเป็นชิ้นแยก
      const expandedParts = this.expandQuantities(sortedParts);

      // วางชิ้นส่วน
      let remainingParts = [...expandedParts];
      const sheet = matchingSheets[0]; // ใช้แผ่นแรกที่ตรง

      while (remainingParts.length > 0) {
        const result = this.packer.pack(sheet, remainingParts);

        if (result.placements.length === 0) {
          // ไม่มีชิ้นส่วนใดใส่ได้ในแผ่นใหม่
          unplacedParts.push(...remainingParts);
          break;
        }

        bins.push({
          sheet,
          placements: result.placements,
          usedArea: result.placements.reduce(
            (sum, p) => sum + p.part.width * p.part.length, 0
          ),
          wasteArea: (sheet.width * sheet.length) -
            result.placements.reduce(
              (sum, p) => sum + p.part.width * p.part.length, 0
            ),
          efficiency: result.efficiency
        });

        // หักชิ้นที่วางแล้วออก
        const placedIds = new Set(result.placements.map(p => p.part.id));
        remainingParts = remainingParts.filter(p => !placedIds.has(p.id));
      }
    }

    // คำนวณ total waste
    const totalUsed = bins.reduce((sum, b) => sum + b.usedArea, 0);
    const totalArea = bins.reduce((sum, b) => sum + b.sheet.width * b.sheet.length, 0);

    return {
      bins,
      unplacedParts,
      totalWaste: totalArea - totalUsed,
      wastePercentage: totalArea > 0 ? ((totalArea - totalUsed) / totalArea) * 100 : 0
    };
  }

  private groupParts(parts: CutPart[]): Map<string, CutPart[]> {
    const groups = new Map<string, CutPart[]>();

    for (const part of parts) {
      const key = `${part.material}|${part.thickness}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(part);
    }

    return groups;
  }

  private expandQuantities(parts: CutPart[]): CutPart[] {
    const expanded: CutPart[] = [];

    for (const part of parts) {
      for (let i = 0; i < part.quantity; i++) {
        expanded.push({
          ...part,
          id: `${part.id}_${i}`,
          quantity: 1
        });
      }
    }

    return expanded;
  }
}
```

---

## ส่วนที่ 4: Advanced Optimization Strategies

### 4.1 Simulated Annealing

```typescript
interface AnnealingConfig {
  initialTemperature: number;     // 1000
  coolingRate: number;            // 0.995
  minTemperature: number;         // 1
  iterationsPerTemp: number;      // 100
}

class SimulatedAnnealingOptimizer {
  private config: AnnealingConfig;
  private constraints: CuttingConstraints;

  constructor(
    constraints: CuttingConstraints,
    config: AnnealingConfig = {
      initialTemperature: 1000,
      coolingRate: 0.995,
      minTemperature: 1,
      iterationsPerTemp: 100
    }
  ) {
    this.constraints = constraints;
    this.config = config;
  }

  optimize(
    sheets: StockSheet[],
    parts: CutPart[]
  ): BinPackingResult {
    // Initial solution using FFD
    const ffdPacker = new FFDBinPacker(this.constraints);
    let currentSolution = ffdPacker.pack(sheets, parts);
    let bestSolution = currentSolution;
    let bestCost = this.calculateCost(currentSolution);

    let temperature = this.config.initialTemperature;

    while (temperature > this.config.minTemperature) {
      for (let i = 0; i < this.config.iterationsPerTemp; i++) {
        // Generate neighbor solution
        const neighbor = this.generateNeighbor(currentSolution, sheets, parts);
        const neighborCost = this.calculateCost(neighbor);
        const currentCost = this.calculateCost(currentSolution);

        const delta = neighborCost - currentCost;

        // Accept or reject
        if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
          currentSolution = neighbor;

          if (neighborCost < bestCost) {
            bestSolution = neighbor;
            bestCost = neighborCost;
          }
        }
      }

      temperature *= this.config.coolingRate;
    }

    return bestSolution;
  }

  private calculateCost(solution: BinPackingResult): number {
    // Cost = waste + penalty for unplaced parts
    const wasteCost = solution.totalWaste * 0.001; // per mm²
    const unplacedPenalty = solution.unplacedParts.length * 10000;
    const sheetCount = solution.bins.length * 100;

    return wasteCost + unplacedPenalty + sheetCount;
  }

  private generateNeighbor(
    current: BinPackingResult,
    sheets: StockSheet[],
    parts: CutPart[]
  ): BinPackingResult {
    // Mutation strategies:
    // 1. Swap two parts between bins
    // 2. Rotate a part
    // 3. Move a part to different position
    // 4. Reorder parts and re-pack

    const strategy = Math.floor(Math.random() * 4);

    switch (strategy) {
      case 0:
        return this.swapParts(current, sheets, parts);
      case 1:
        return this.rotatePart(current, sheets, parts);
      case 2:
        return this.movePart(current, sheets, parts);
      case 3:
        return this.reorderAndRepack(current, sheets, parts);
      default:
        return current;
    }
  }

  private swapParts(
    current: BinPackingResult,
    sheets: StockSheet[],
    parts: CutPart[]
  ): BinPackingResult {
    // Implementation: swap two random parts between different bins
    // and re-validate the layout
    // ...
    return current; // placeholder
  }

  private rotatePart(
    current: BinPackingResult,
    sheets: StockSheet[],
    parts: CutPart[]
  ): BinPackingResult {
    // Implementation: rotate a random part if grain allows
    // ...
    return current; // placeholder
  }

  private movePart(
    current: BinPackingResult,
    sheets: StockSheet[],
    parts: CutPart[]
  ): BinPackingResult {
    // Implementation: move a part to a better position
    // ...
    return current; // placeholder
  }

  private reorderAndRepack(
    current: BinPackingResult,
    sheets: StockSheet[],
    parts: CutPart[]
  ): BinPackingResult {
    // Shuffle parts and re-pack using FFD
    const shuffled = [...parts].sort(() => Math.random() - 0.5);
    const ffdPacker = new FFDBinPacker(this.constraints);
    return ffdPacker.pack(sheets, shuffled);
  }
}
```

### 4.2 Genetic Algorithm

```typescript
interface GeneticConfig {
  populationSize: number;         // 50
  generations: number;            // 100
  mutationRate: number;           // 0.1
  crossoverRate: number;          // 0.8
  elitismCount: number;           // 5
}

interface Chromosome {
  partOrder: number[];            // ลำดับการวางชิ้นส่วน
  rotations: boolean[];           // การหมุนแต่ละชิ้น
  fitness: number;
}

class GeneticOptimizer {
  private config: GeneticConfig;
  private constraints: CuttingConstraints;

  constructor(
    constraints: CuttingConstraints,
    config: GeneticConfig = {
      populationSize: 50,
      generations: 100,
      mutationRate: 0.1,
      crossoverRate: 0.8,
      elitismCount: 5
    }
  ) {
    this.constraints = constraints;
    this.config = config;
  }

  optimize(
    sheets: StockSheet[],
    parts: CutPart[]
  ): BinPackingResult {
    // Initialize population
    let population = this.initializePopulation(parts.length);

    for (let gen = 0; gen < this.config.generations; gen++) {
      // Evaluate fitness
      population = this.evaluateFitness(population, sheets, parts);

      // Sort by fitness
      population.sort((a, b) => a.fitness - b.fitness);

      // Create new generation
      const newPopulation: Chromosome[] = [];

      // Elitism: keep best individuals
      for (let i = 0; i < this.config.elitismCount; i++) {
        newPopulation.push(population[i]);
      }

      // Fill rest with crossover and mutation
      while (newPopulation.length < this.config.populationSize) {
        const parent1 = this.selectParent(population);
        const parent2 = this.selectParent(population);

        let child: Chromosome;
        if (Math.random() < this.config.crossoverRate) {
          child = this.crossover(parent1, parent2);
        } else {
          child = { ...parent1 };
        }

        if (Math.random() < this.config.mutationRate) {
          child = this.mutate(child);
        }

        newPopulation.push(child);
      }

      population = newPopulation;
    }

    // Return best solution
    population = this.evaluateFitness(population, sheets, parts);
    population.sort((a, b) => a.fitness - b.fitness);

    return this.chromosomeToSolution(population[0], sheets, parts);
  }

  private initializePopulation(partCount: number): Chromosome[] {
    const population: Chromosome[] = [];

    for (let i = 0; i < this.config.populationSize; i++) {
      // Random permutation
      const order = Array.from({ length: partCount }, (_, i) => i);
      this.shuffleArray(order);

      const rotations = Array.from({ length: partCount }, () =>
        Math.random() < 0.5
      );

      population.push({
        partOrder: order,
        rotations,
        fitness: Infinity
      });
    }

    return population;
  }

  private evaluateFitness(
    population: Chromosome[],
    sheets: StockSheet[],
    parts: CutPart[]
  ): Chromosome[] {
    return population.map(chromosome => {
      const solution = this.chromosomeToSolution(chromosome, sheets, parts);
      return {
        ...chromosome,
        fitness: this.calculateFitness(solution)
      };
    });
  }

  private calculateFitness(solution: BinPackingResult): number {
    // Lower is better
    return (
      solution.wastePercentage +
      solution.unplacedParts.length * 100 +
      solution.bins.length * 10
    );
  }

  private selectParent(population: Chromosome[]): Chromosome {
    // Tournament selection
    const tournamentSize = 5;
    let best: Chromosome | null = null;

    for (let i = 0; i < tournamentSize; i++) {
      const idx = Math.floor(Math.random() * population.length);
      if (!best || population[idx].fitness < best.fitness) {
        best = population[idx];
      }
    }

    return best!;
  }

  private crossover(parent1: Chromosome, parent2: Chromosome): Chromosome {
    // Order Crossover (OX)
    const length = parent1.partOrder.length;
    const start = Math.floor(Math.random() * length);
    const end = start + Math.floor(Math.random() * (length - start));

    const childOrder = new Array(length).fill(-1);
    const childRotations = new Array(length).fill(false);

    // Copy segment from parent1
    for (let i = start; i <= end; i++) {
      childOrder[i] = parent1.partOrder[i];
      childRotations[i] = parent1.rotations[i];
    }

    // Fill rest from parent2
    let pos = (end + 1) % length;
    for (const gene of parent2.partOrder) {
      if (!childOrder.includes(gene)) {
        childOrder[pos] = gene;
        childRotations[pos] = parent2.rotations[parent2.partOrder.indexOf(gene)];
        pos = (pos + 1) % length;
      }
    }

    return {
      partOrder: childOrder,
      rotations: childRotations,
      fitness: Infinity
    };
  }

  private mutate(chromosome: Chromosome): Chromosome {
    const mutated = { ...chromosome };
    const length = mutated.partOrder.length;

    // Swap mutation
    const i = Math.floor(Math.random() * length);
    const j = Math.floor(Math.random() * length);

    [mutated.partOrder[i], mutated.partOrder[j]] =
      [mutated.partOrder[j], mutated.partOrder[i]];

    // Rotation mutation
    const k = Math.floor(Math.random() * length);
    mutated.rotations[k] = !mutated.rotations[k];

    return mutated;
  }

  private chromosomeToSolution(
    chromosome: Chromosome,
    sheets: StockSheet[],
    parts: CutPart[]
  ): BinPackingResult {
    // Reorder parts according to chromosome
    const orderedParts = chromosome.partOrder.map((idx, i) => ({
      ...parts[idx],
      // Apply rotation if indicated
      ...(chromosome.rotations[i] && this.constraints.allowRotation ? {
        width: parts[idx].length,
        length: parts[idx].width
      } : {})
    }));

    // Pack using FFD
    const packer = new FFDBinPacker(this.constraints);
    return packer.pack(sheets, orderedParts);
  }

  private shuffleArray(array: number[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}
```

---

## ส่วนที่ 5: Cut Sequence Generation

### 5.1 Cutting Instructions

```typescript
interface CutInstruction {
  sequence: number;               // ลำดับการตัด
  type: 'rip' | 'crosscut';       // ตัดตามยาว/ตัดขวาง
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;                  // ความลึก (full หรือ partial)
  resultParts: string[];          // ชิ้นส่วนที่ได้จากการตัดนี้
}

function generateCutSequence(layout: SheetLayout): CutInstruction[] {
  const instructions: CutInstruction[] = [];
  let sequence = 1;

  // Generate cuts from Guillotine tree
  traverseCuts(layout.tree.root, (node, cutLine) => {
    instructions.push({
      sequence: sequence++,
      type: cutLine.direction === 'horizontal' ? 'rip' : 'crosscut',
      x1: cutLine.x1,
      y1: cutLine.y1,
      x2: cutLine.x2,
      y2: cutLine.y2,
      depth: -1, // Full depth
      resultParts: cutLine.parts
    });
  });

  // Optimize cut order to minimize material handling
  return optimizeCutOrder(instructions);
}

function optimizeCutOrder(cuts: CutInstruction[]): CutInstruction[] {
  // Group by direction and optimize
  const rips = cuts.filter(c => c.type === 'rip');
  const crosscuts = cuts.filter(c => c.type === 'crosscut');

  // Sort rips by Y position
  rips.sort((a, b) => a.y1 - b.y1);

  // Sort crosscuts by X position
  crosscuts.sort((a, b) => a.x1 - b.x1);

  // Interleave based on dependency
  // ...

  return [...rips, ...crosscuts].map((cut, i) => ({
    ...cut,
    sequence: i + 1
  }));
}
```

### 5.2 G-code Generation for CNC Router

```typescript
interface GCodeConfig {
  rapidFeed: number;              // mm/min for G0
  cuttingFeed: number;            // mm/min for G1
  plungeFeed: number;             // mm/min for plunge
  safeHeight: number;             // mm above material
  cutDepth: number;               // mm per pass
  toolDiameter: number;           // mm
  spindleSpeed: number;           // RPM
}

const DEFAULT_GCODE_CONFIG: GCodeConfig = {
  rapidFeed: 10000,
  cuttingFeed: 4000,
  plungeFeed: 1000,
  safeHeight: 10,
  cutDepth: 8,
  toolDiameter: 6,
  spindleSpeed: 18000
};

function generateCuttingGCode(
  layout: SheetLayout,
  config: GCodeConfig = DEFAULT_GCODE_CONFIG
): string {
  const lines: string[] = [];

  // Header
  lines.push('G90 ; Absolute positioning');
  lines.push('G21 ; Metric units');
  lines.push(`S${config.spindleSpeed} M3 ; Spindle on`);
  lines.push(`G0 Z${config.safeHeight} ; Safe height`);
  lines.push('');

  const cuts = generateCutSequence(layout);

  for (const cut of cuts) {
    lines.push(`; Cut ${cut.sequence}: ${cut.type}`);

    // Rapid to start position
    lines.push(`G0 X${cut.x1.toFixed(3)} Y${cut.y1.toFixed(3)}`);

    // Calculate number of passes
    const materialThickness = layout.sheet.thickness;
    const passes = Math.ceil(materialThickness / config.cutDepth);

    for (let pass = 1; pass <= passes; pass++) {
      const z = -Math.min(pass * config.cutDepth, materialThickness + 1);

      // Plunge
      lines.push(`G1 Z${z.toFixed(3)} F${config.plungeFeed}`);

      // Cut
      lines.push(`G1 X${cut.x2.toFixed(3)} Y${cut.y2.toFixed(3)} F${config.cuttingFeed}`);

      // Retract for next pass
      if (pass < passes) {
        lines.push(`G0 Z${config.safeHeight}`);
        lines.push(`G0 X${cut.x1.toFixed(3)} Y${cut.y1.toFixed(3)}`);
      }
    }

    // Retract
    lines.push(`G0 Z${config.safeHeight}`);
    lines.push('');
  }

  // Footer
  lines.push('M5 ; Spindle off');
  lines.push('G0 X0 Y0 ; Return home');
  lines.push('M30 ; Program end');

  return lines.join('\n');
}
```

---

## ส่วนที่ 6: Visualization & Reports

### 6.1 SVG Layout Export

```typescript
function generateLayoutSVG(layout: SheetLayout): string {
  const scale = 0.1; // 1mm = 0.1px
  const padding = 20;

  const width = layout.sheet.width * scale + padding * 2;
  const height = layout.sheet.length * scale + padding * 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg"
    width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  // Sheet outline
  svg += `<rect x="${padding}" y="${padding}"
    width="${layout.sheet.width * scale}"
    height="${layout.sheet.length * scale}"
    fill="#f0f0f0" stroke="#333" stroke-width="2"/>`;

  // Placed parts
  for (const placement of layout.placements) {
    const x = placement.x * scale + padding;
    const y = placement.y * scale + padding;
    const w = (placement.rotated ? placement.part.length : placement.part.width) * scale;
    const h = (placement.rotated ? placement.part.width : placement.part.length) * scale;

    // Part rectangle
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}"
      fill="#4CAF50" stroke="#2E7D32" stroke-width="1" opacity="0.8"/>`;

    // Label
    const fontSize = Math.min(w, h) * 0.15;
    svg += `<text x="${x + w / 2}" y="${y + h / 2}"
      font-size="${fontSize}px" text-anchor="middle" dominant-baseline="middle"
      fill="#fff">${placement.part.name}</text>`;

    // Dimensions
    svg += `<text x="${x + w / 2}" y="${y + h - 5}"
      font-size="${fontSize * 0.6}px" text-anchor="middle" fill="#fff">
      ${placement.part.width}×${placement.part.length}</text>`;
  }

  // Efficiency label
  svg += `<text x="${padding}" y="${height - 5}"
    font-size="12px" fill="#333">
    Efficiency: ${(layout.efficiency * 100).toFixed(1)}%</text>`;

  svg += '</svg>';
  return svg;
}
```

### 6.2 Cut List Report

```typescript
interface CutListReport {
  summary: {
    totalParts: number;
    totalSheets: number;
    totalArea: number;
    usedArea: number;
    wasteArea: number;
    efficiency: number;
    estimatedCost: number;
  };
  sheets: SheetReport[];
  partList: PartListItem[];
}

interface SheetReport {
  sheetNumber: number;
  material: string;
  dimensions: string;
  partsCount: number;
  efficiency: number;
  parts: string[];
}

interface PartListItem {
  name: string;
  dimensions: string;
  material: string;
  quantity: number;
  sheetNumbers: number[];
  edgeBanding: string;
}

function generateCutListReport(result: BinPackingResult): CutListReport {
  const totalArea = result.bins.reduce(
    (sum, b) => sum + b.sheet.width * b.sheet.length, 0
  );
  const usedArea = result.bins.reduce((sum, b) => sum + b.usedArea, 0);

  return {
    summary: {
      totalParts: result.bins.reduce((sum, b) => sum + b.placements.length, 0),
      totalSheets: result.bins.length,
      totalArea: totalArea / 1000000, // m²
      usedArea: usedArea / 1000000,
      wasteArea: (totalArea - usedArea) / 1000000,
      efficiency: usedArea / totalArea,
      estimatedCost: result.bins.reduce((sum, b) => sum + b.sheet.cost, 0)
    },
    sheets: result.bins.map((bin, i) => ({
      sheetNumber: i + 1,
      material: bin.sheet.material,
      dimensions: `${bin.sheet.width}×${bin.sheet.length}`,
      partsCount: bin.placements.length,
      efficiency: bin.efficiency,
      parts: bin.placements.map(p => p.part.name)
    })),
    partList: consolidatePartList(result)
  };
}

function consolidatePartList(result: BinPackingResult): PartListItem[] {
  const partMap = new Map<string, PartListItem>();

  result.bins.forEach((bin, sheetIndex) => {
    bin.placements.forEach(placement => {
      const key = `${placement.part.name}|${placement.part.width}×${placement.part.length}`;

      if (partMap.has(key)) {
        const item = partMap.get(key)!;
        item.quantity++;
        if (!item.sheetNumbers.includes(sheetIndex + 1)) {
          item.sheetNumbers.push(sheetIndex + 1);
        }
      } else {
        partMap.set(key, {
          name: placement.part.name,
          dimensions: `${placement.part.width}×${placement.part.length}`,
          material: placement.part.material,
          quantity: 1,
          sheetNumbers: [sheetIndex + 1],
          edgeBanding: formatEdgeBanding(placement.part.edgeBanding)
        });
      }
    });
  });

  return Array.from(partMap.values());
}

function formatEdgeBanding(spec: EdgeBandingSpec): string {
  const edges: string[] = [];
  if (spec.top > 0) edges.push('T');
  if (spec.bottom > 0) edges.push('B');
  if (spec.left > 0) edges.push('L');
  if (spec.right > 0) edges.push('R');
  return edges.length > 0 ? edges.join('+') : 'None';
}
```

---

## ส่วนที่ 7: Performance Benchmarks

### 7.1 Algorithm Comparison

| Algorithm | Parts Count | Time (ms) | Efficiency | Best For |
|-----------|-------------|-----------|------------|----------|
| FFD | 100 | 50 | 75-80% | Quick estimates |
| Guillotine Best Fit | 100 | 100 | 80-85% | Production |
| Simulated Annealing | 100 | 2000 | 85-90% | Optimization |
| Genetic Algorithm | 100 | 5000 | 88-92% | Large batches |

### 7.2 Optimization Targets

```typescript
interface OptimizationTargets {
  minEfficiency: number;          // 80% minimum
  maxWaste: number;               // 20% maximum
  maxSheetsPerBatch: number;      // Limit for handling
  maxOptimizationTime: number;    // ms
}

const PRODUCTION_TARGETS: OptimizationTargets = {
  minEfficiency: 0.80,
  maxWaste: 0.20,
  maxSheetsPerBatch: 50,
  maxOptimizationTime: 10000
};

function selectOptimizer(
  partCount: number,
  targets: OptimizationTargets
): 'ffd' | 'annealing' | 'genetic' {
  if (partCount < 20) {
    return 'ffd'; // Quick for small jobs
  } else if (partCount < 100) {
    return 'annealing';
  } else {
    return 'genetic';
  }
}
```

---

## บทสรุป (Summary)

เอกสารนี้ครอบคลุมอัลกอริทึมการจัดเรียงการตัดวัสดุ:

1. **Guillotine Cut**: การตัดทะลุเต็มแผ่นสำหรับ Panel Saw
2. **FFD Algorithm**: First Fit Decreasing สำหรับการจัดเรียงเบื้องต้น
3. **Simulated Annealing**: การปรับปรุงผลลัพธ์ด้วย meta-heuristic
4. **Genetic Algorithm**: การค้นหาคำตอบที่ดีที่สุดสำหรับงานขนาดใหญ่
5. **Cut Sequence**: การสร้างลำดับการตัดที่เหมาะสม
6. **G-code Generation**: การส่งออกสำหรับ CNC Router
7. **Visualization**: การแสดงผล Layout และ Report

**Reference Documents:**
- [Hardware & Drilling Specifications](./hardware-drilling-specifications.md)
- [Door & Drawer Complete Guide](./door-drawer-complete-guide.md)
- [Parametric Cabinet Calculations](../technical/parametric-cabinet-calculations.md)
