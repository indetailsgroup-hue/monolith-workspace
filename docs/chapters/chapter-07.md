---
num: 7
title: "Rebuild Blueprint"
phase: "Foundation"
phase_num: 0
mcp_tools: 2
status: complete
dependencies: "—"
---

# 7\. เอกสารสำหรับนักพัฒนา (Developer Documentation)

## 7\. เอกสารสำหรับนักพัฒนา (Developer Documentation)

### 7.1. การติดตั้งและ Setup Environment

#### 7.1.1. ความต้องการของระบบ

**Software Requirements:**

  * Node.js 20 LTS หรือสูงกว่า
  * pnpm 8.0 หรือสูงกว่า
  * PostgreSQL 15 หรือสูงกว่า
  * Redis 7 หรือสูงกว่า
  * Docker และ Docker Compose (สำหรับ development)
  * Git



**Hardware Requirements (Development):**

  * CPU: 4 cores หรือมากกว่า
  * RAM: 8 GB หรือมากกว่า
  * Storage: 20 GB available space
  * GPU: รองรับ WebGPU (สำหรับทดสอบ 3D features)



#### 7.1.2. การติดตั้ง

**1\. Clone Repository:**
[code] 
    git clone https://github.com/your-org/monolith-manufacturing-os.git
    cd monolith-manufacturing-os
    
[/code]

**2\. ติดตั้ง Dependencies:**
[code] 
    pnpm install
    
[/code]

**3\. Setup Environment Variables:**
[code] 
    cp .env.example .env
    
[/code]

แก้ไขไฟล์ `.env`:
[code] 
    # Database
    DATABASE_URL="postgresql://user:password@localhost:5432/monolith"
    REDIS_URL="redis://localhost:6379"
    
    # Authentication
    JWT_SECRET="your-secret-key-here"
    JWT_EXPIRES_IN="7d"
    
    # MCP Server
    MCP_PORT=3100
    MCP_TOKEN="your-mcp-token-here"
    
    # AI Services
    OPENAI_API_KEY="your-openai-key"
    ANTHROPIC_API_KEY="your-anthropic-key"
    
    # Storage
    S3_BUCKET="monolith-storage"
    S3_REGION="us-east-1"
    S3_ACCESS_KEY="your-access-key"
    S3_SECRET_KEY="your-secret-key"
    
    # Stripe
    STRIPE_SECRET_KEY="sk_test_..."
    STRIPE_WEBHOOK_SECRET="whsec_..."
    
    # Monitoring
    SENTRY_DSN="your-sentry-dsn"
    
[/code]

**4\. Setup Database:**
[code] 
    # Start PostgreSQL และ Redis ด้วย Docker
    docker-compose up -d postgres redis
    
    # Run migrations
    pnpm db:migrate
    
    # Seed database (optional)
    pnpm db:seed
    
[/code]

**5\. Build:**
[code] 
    pnpm build
    
[/code]

**6\. Start Development Server:**
[code] 
    # Start all services
    pnpm dev
    
    # หรือ start แยกส่วน
    pnpm dev:frontend  # Frontend dev server
    pnpm dev:backend   # Backend API server
    pnpm dev:mcp       # MCP server
    
[/code]

#### 7.1.3. Docker Development Environment

**docker-compose.yml:**
[code] 
    version: '3.8'
    
    services:
      postgres:
        image: timescale/timescaledb:latest-pg15
        environment:
          POSTGRES_DB: monolith
          POSTGRES_USER: monolith
          POSTGRES_PASSWORD: monolith
        ports:
          - "5432:5432"
        volumes:
          - postgres_data:/var/lib/postgresql/data
    
      redis:
        image: redis:7-alpine
        ports:
          - "6379:6379"
        volumes:
          - redis_data:/data
    
      minio:
        image: minio/minio:latest
        command: server /data --console-address ":9001"
        environment:
          MINIO_ROOT_USER: minioadmin
          MINIO_ROOT_PASSWORD: minioadmin
        ports:
          - "9000:9000"
          - "9001:9001"
        volumes:
          - minio_data:/data
    
    volumes:
      postgres_data:
      redis_data:
      minio_data:
    
[/code]

**Start all services:**
[code] 
    docker-compose up -d
    
[/code]

### 7.2. โครงสร้างโปรเจกต์
[code] 
    monolith-manufacturing-os/
    ├── packages/
    │   ├── frontend/              # React frontend
    │   │   ├── src/
    │   │   │   ├── components/    # React components
    │   │   │   ├── pages/         # Page components
    │   │   │   ├── hooks/         # Custom hooks
    │   │   │   ├── stores/        # State management
    │   │   │   ├── services/      # API services
    │   │   │   ├── utils/         # Utility functions
    │   │   │   ├── types/         # TypeScript types
    │   │   │   └── App.tsx
    │   │   ├── public/
    │   │   ├── package.json
    │   │   └── vite.config.ts
    │   │
    │   ├── backend/               # Express backend
    │   │   ├── src/
    │   │   │   ├── routes/        # API routes
    │   │   │   ├── controllers/   # Route controllers
    │   │   │   ├── services/      # Business logic
    │   │   │   ├── models/        # Data models
    │   │   │   ├── middleware/    # Express middleware
    │   │   │   ├── utils/         # Utility functions
    │   │   │   ├── types/         # TypeScript types
    │   │   │   └── index.ts
    │   │   ├── tests/
    │   │   └── package.json
    │   │
    │   ├── mcp-server/            # MCP server
    │   │   ├── src/
    │   │   │   ├── tools/         # MCP tools
    │   │   │   ├── skills/        # MCP skills
    │   │   │   ├── types.ts       # Type definitions
    │   │   │   └── index.ts       # Server entry
    │   │   ├── tests/
    │   │   └── package.json
    │   │
    │   ├── shared/                # Shared code
    │   │   ├── src/
    │   │   │   ├── types/         # Shared types
    │   │   │   ├── utils/         # Shared utilities
    │   │   │   ├── constants/     # Constants
    │   │   │   └── stage-budgets.ts
    │   │   └── package.json
    │   │
    │   └── database/              # Database migrations
    │       ├── migrations/
    │       ├── seeds/
    │       └── package.json
    │
    ├── docs/                      # Documentation
    │   ├── api/                   # API documentation
    │   ├── guides/                # User guides
    │   └── architecture/          # Architecture docs
    │
    ├── scripts/                   # Build และ deployment scripts
    │   ├── build.sh
    │   ├── deploy.sh
    │   └── test.sh
    │
    ├── .github/                   # GitHub workflows
    │   └── workflows/
    │       ├── ci.yml
    │       └── release.yml
    │
    ├── docker-compose.yml
    ├── package.json               # Root package.json
    ├── pnpm-workspace.yaml
    ├── tsconfig.json
    ├── .env.example
    ├── .gitignore
    ├── README.md
    ├── CHANGELOG.md
    ├── CONTRIBUTING.md
    ├── CODE_OF_CONDUCT.md
    ├── SECURITY.md
    └── LICENSE
    
[/code]

### 7.3. MCP Tools Reference

#### 7.3.1. validate_panel_design

**Description** : ตรวจสอบความถูกต้องของการออกแบบแผงเฟอร์นิเจอร์

**Input:**
[code] 
    interface ValidatePanelDesignInput {
      design: PanelDesign;
      stage?: 'design' | 'prototype' | 'production';
    }
    
[/code]

**Output:**
[code] 
    interface ValidationResult {
      valid: boolean;
      errors: string[];
      warnings: string[];
      suggestions?: string[];
    }
    
[/code]

**Example:**
[code] 
    const result = await mcpClient.call('validate_panel_design', {
      design: myDesign,
      stage: 'production'
    });
    
    if (!result.valid) {
      console.error('Validation errors:', result.errors);
      console.warn('Warnings:', result.warnings);
    }
    
[/code]

#### 7.3.2. generate_cutting_list

**Description** : สร้างรายการตัดจากการออกแบบ

**Input:**
[code] 
    interface GenerateCuttingListInput {
      design: PanelDesign;
      options?: {
        groupByMaterial?: boolean;
        includeWaste?: boolean;
      };
    }
    
[/code]

**Output:**
[code] 
    interface CuttingListResult {
      items: CuttingListItem[];
      summary: {
        totalPanels: number;
        totalArea: number;
        materials: MaterialSummary[];
      };
    }
    
    interface CuttingListItem {
      id: string;
      name: string;
      width: number;
      height: number;
      thickness: number;
      material: string;
      quantity: number;
      edgeBanding?: string[];
    }
    
[/code]

**Example:**
[code] 
    const cuttingList = await mcpClient.call('generate_cutting_list', {
      design: myDesign,
      options: {
        groupByMaterial: true,
        includeWaste: true
      }
    });
    
    console.log(`Total panels: ${cuttingList.summary.totalPanels}`);
    
[/code]

#### 7.3.3. export_dxf

**Description** : ส่งออกไฟล์ DXF สำหรับเครื่อง CNC

**Input:**
[code] 
    interface ExportDXFInput {
      design: PanelDesign;
      options?: {
        version?: 'AC1015' | 'AC1021' | 'AC1027';
        units?: 'Millimeters' | 'Inches';
        layers?: string[];
      };
    }
    
[/code]

**Output:**
[code] 
    interface DXFExportResult {
      content: string;
      filename: string;
      size: number;
    }
    
[/code]

**Example:**
[code] 
    const dxf = await mcpClient.call('export_dxf', {
      design: myDesign,
      options: {
        version: 'AC1015',
        units: 'Millimeters'
      }
    });
    
    // Save to file
    fs.writeFileSync(dxf.filename, dxf.content);
    
[/code]

#### 7.3.4. preview_layout

**Description** : แสดงตัวอย่างการจัดวางชิ้นส่วน

**Input:**
[code] 
    interface PreviewLayoutInput {
      design: PanelDesign;
      sheets: SheetStock[];
      options?: {
        width?: number;
        height?: number;
        format?: 'png' | 'jpeg' | 'svg';
      };
    }
    
[/code]

**Output:**
[code] 
    interface SnapshotResult {
      image: Buffer | string;
      format: string;
      width: number;
      height: number;
    }
    
[/code]

**Example:**
[code] 
    const preview = await mcpClient.call('preview_layout', {
      design: myDesign,
      sheets: availableSheets,
      options: {
        width: 1920,
        height: 1080,
        format: 'png'
      }
    });
    
    // Save image
    fs.writeFileSync('preview.png', preview.image);
    
[/code]

#### 7.3.5. optimize_nesting

**Description** : เพิ่มประสิทธิภาพการจัดวางชิ้นส่วน

**Input:**
[code] 
    interface OptimizeNestingInput {
      panels: Panel[];
      sheets: SheetStock[];
      algorithm?: 'ga' | 'sa' | 'ffd' | 'bfd' | 'guillotine';
      options?: {
        maxTime?: number;
        targetEfficiency?: number;
      };
    }
    
[/code]

**Output:**
[code] 
    interface NestingResult {
      sheets: PlacedSheet[];
      totalSheets: number;
      totalCost: number;
      wastePercentage: number;
      efficiency: number;
      executionTime: number;
    }
    
[/code]

**Example:**
[code] 
    const nesting = await mcpClient.call('optimize_nesting', {
      panels: myPanels,
      sheets: availableSheets,
      algorithm: 'ga',
      options: {
        maxTime: 30000, // 30 seconds
        targetEfficiency: 85
      }
    });
    
    console.log(`Efficiency: ${nesting.efficiency}%`);
    console.log(`Waste: ${nesting.wastePercentage}%`);
    
[/code]

#### 7.3.6. calculate_material_cost

**Description** : คำนวณต้นทุนวัสดุ

**Input:**
[code] 
    interface CalculateMaterialCostInput {
      design: PanelDesign;
      materialPrices?: Record<string, number>;
      includeWaste?: boolean;
    }
    
[/code]

**Output:**
[code] 
    interface CostResult {
      materials: MaterialCost[];
      hardware: HardwareCost[];
      subtotal: number;
      waste: number;
      total: number;
      breakdown: CostBreakdown;
    }
    
[/code]

**Example:**
[code] 
    const cost = await mcpClient.call('calculate_material_cost', {
      design: myDesign,
      materialPrices: {
        'plywood': 500,
        'mdf': 300
      },
      includeWaste: true
    });
    
    console.log(`Total cost: ${cost.total} บาท`);
    
[/code]

#### 7.3.7. canvas_snapshot

**Description** : จับภาพหน้าจอ canvas

**Input:**
[code] 
    interface CanvasSnapshotInput {
      canvasId: string;
      options?: {
        format?: 'png' | 'jpeg' | 'webp';
        quality?: number;
        width?: number;
        height?: number;
      };
    }
    
[/code]

**Output:**
[code] 
    interface SnapshotResult {
      image: Buffer | string;
      format: string;
      width: number;
      height: number;
    }
    
[/code]

**Example:**
[code] 
    const snapshot = await mcpClient.call('canvas_snapshot', {
      canvasId: '3d-canvas',
      options: {
        format: 'png',
        quality: 0.9
      }
    });
    
[/code]

#### 7.3.8. export_step_file

**Description** : ส่งออกไฟล์ STEP สำหรับ CAD

**Input:**
[code] 
    interface ExportStepInput {
      design: PanelDesign;
      options?: {
        version?: 'AP203' | 'AP214' | 'AP242';
        includeAssembly?: boolean;
      };
    }
    
[/code]

**Output:**
[code] 
    interface StepExportResult {
      content: string;
      filename: string;
      size: number;
    }
    
[/code]

**Example:**
[code] 
    const step = await mcpClient.call('export_step_file', {
      design: myDesign,
      options: {
        version: 'AP214',
        includeAssembly: true
      }
    });
    
    fs.writeFileSync(step.filename, step.content);
    
[/code]

#### 7.3.9. load_skill

**Description** : โหลดและรันทักษะเฉพาะทาง

**Input:**
[code] 
    interface LoadSkillInput {
      skillName: string;
      parameters: Record<string, any>;
    }
    
[/code]

**Output:**
[code] 
    interface SkillResult {
      success: boolean;
      output: any;
      error?: string;
    }
    
[/code]

**Example:**
[code] 
    const result = await mcpClient.call('load_skill', {
      skillName: 'design_validation',
      parameters: {
        design: myDesign,
        strict: true
      }
    });
    
[/code]

### 7.4. Skills และ Workflows

#### 7.4.1. Design Validation Skill

**Purpose** : ตรวจสอบการออกแบบอย่างครอบคลุม

**Usage:**
[code] 
    const result = await loadSkill('design_validation', {
      design: myDesign,
      checks: ['budget', 'engineering', 'manufacturing', 'aesthetics'],
      strict: true
    });
    
[/code]

**Output:**
[code] 
    interface DesignValidationResult {
      overall: 'pass' | 'fail' | 'warning';
      checks: {
        budget: CheckResult;
        engineering: CheckResult;
        manufacturing: CheckResult;
        aesthetics: CheckResult;
      };
      score: number;
      recommendations: string[];
    }
    
[/code]

#### 7.4.2. Cutting Optimization Skill

**Purpose** : เพิ่มประสิทธิภาพการตัดวัสดุ

**Usage:**
[code] 
    const result = await loadSkill('cutting_optimization', {
      design: myDesign,
      sheets: availableSheets,
      objectives: ['minimize_waste', 'minimize_sheets', 'minimize_cost']
    });
    
[/code]

**Output:**
[code] 
    interface CuttingOptimizationResult {
      nesting: NestingResult;
      cuttingList: CuttingListResult;
      gcode?: string;
      estimatedTime: number;
      recommendations: string[];
    }
    
[/code]

#### 7.4.3. Cost Estimation Skill

**Purpose** : คำนวณต้นทุนโดยละเอียด

**Usage:**
[code] 
    const result = await loadSkill('cost_estimation', {
      design: myDesign,
      includeLabor: true,
      includeOverhead: true,
      profitMargin: 0.3
    });
    
[/code]

**Output:**
[code] 
    interface CostEstimationResult {
      materials: number;
      hardware: number;
      labor: number;
      overhead: number;
      subtotal: number;
      profit: number;
      sellingPrice: number;
      breakdown: DetailedCostBreakdown;
    }
    
[/code]

#### 7.4.4. Production Planning Skill

**Purpose** : วางแผนการผลิต

**Usage:**
[code] 
    const result = await loadSkill('production_planning', {
      designs: [design1, design2, design3],
      resources: productionResources,
      deadline: new Date('2026-10-01')
    });
    
[/code]

**Output:**
[code] 
    interface ProductionPlanningResult {
      schedule: ProductionSchedule;
      resourceAllocation: ResourceAllocation;
      estimatedCompletion: Date;
      bottlenecks: Bottleneck[];
      recommendations: string[];
    }
    
[/code]

#### 7.4.5. Quality Assurance Skill

**Purpose** : ตรวจสอบคุณภาพ

**Usage:**
[code] 
    const result = await loadSkill('quality_assurance', {
      design: myDesign,
      standards: ['ISO', 'DIN', 'ANSI'],
      checkpoints: ['design', 'materials', 'assembly', 'finish']
    });
    
[/code]

**Output:**
[code] 
    interface QualityAssuranceResult {
      overallScore: number;
      checkpoints: CheckpointResult[];
      standards: StandardsCompliance[];
      issues: QualityIssue[];
      recommendations: string[];
    }
    
[/code]

#### 7.4.6. Material Management Skill

**Purpose** : จัดการสต็อกวัสดุ

**Usage:**
[code] 
    const result = await loadSkill('material_management', {
      design: myDesign,
      currentStock: stockLevels,
      leadTime: 7 // days
    });
    
[/code]

**Output:**
[code] 
    interface MaterialManagementResult {
      required: MaterialRequirement[];
      available: MaterialAvailability[];
      toOrder: MaterialOrder[];
      estimatedCost: number;
      deliveryDate: Date;
    }
    
[/code]

#### 7.4.7. Recommended Workflow

**Complete Design-to-Production Workflow:**
[code] 
    async function completeWorkflow(requirements: DesignRequirements) {
      // 1. Design
      const designs = await aiAgent.generateDesign(requirements);
      const selectedDesign = designs;
    
      // 2. Validate
      const validation = await mcpClient.call('validate_panel_design', {
        design: selectedDesign,
        stage: 'production'
      });
    
      if (!validation.valid) {
        throw new Error('Design validation failed');
      }
    
      // 3. Generate Cutting List
      const cuttingList = await mcpClient.call('generate_cutting_list', {
        design: selectedDesign
      });
    
      // 4. Optimize Nesting
      const nesting = await mcpClient.call('optimize_nesting', {
        panels: cuttingList.items,
        sheets: availableSheets,
        algorithm: 'ga'
      });
    
      // 5. Preview Layout
      const preview = await mcpClient.call('preview_layout', {
        design: selectedDesign,
        sheets: nesting.sheets
      });
    
      // 6. Calculate Cost
      const cost = await mcpClient.call('calculate_material_cost', {
        design: selectedDesign
      });
    
      // 7. Export Files
      const dxf = await mcpClient.call('export_dxf', {
        design: selectedDesign
      });
    
      const step = await mcpClient.call('export_step_file', {
        design: selectedDesign
      });
    
      // 8. Capture Snapshot
      const snapshot = await mcpClient.call('canvas_snapshot', {
        canvasId: '3d-canvas'
      });
    
      return {
        design: selectedDesign,
        validation,
        cuttingList,
        nesting,
        preview,
        cost,
        exports: { dxf, step },
        snapshot
      };
    }
    
[/code]

### 7.5. Integration Patterns

#### 7.5.1. Environment Variable Integration

**Setup:**
[code] 
    # .env
    MCP_SERVER_URL=http://localhost:3100
    MCP_TOKEN=your-token-here
    
[/code]

**Usage:**
[code] 
    import { MCPClient } from '@monolith/mcp-client';
    
    const client = new MCPClient({
      url: process.env.MCP_SERVER_URL,
      token: process.env.MCP_TOKEN
    });
    
    const result = await client.call('validate_panel_design', { design });
    
[/code]

#### 7.5.2. Pipeline Export Integration

**Export Pipeline:**
[code] 
    import { MonolithPipeline } from '@monolith/pipeline';
    
    const pipeline = new MonolithPipeline({
      mcpUrl: process.env.MCP_SERVER_URL,
      mcpToken: process.env.MCP_TOKEN
    });
    
    // Use pipeline
    const result = await pipeline
      .design(requirements)
      .validate()
      .optimize()
      .export(['dxf', 'step', 'pdf'])
      .execute();
    
[/code]

#### 7.5.3. Direct Adapter Integration

**Custom Adapter:**
[code] 
    import { MonolithPipelineAdapter } from '@monolith/types';
    
    class CustomAdapter implements MonolithPipelineAdapter {
      async validateDesign(design: PanelDesign): Promise<ValidationResult> {
        // Custom implementation
        return customValidation(design);
      }
    
      async generateCuttingList(design: PanelDesign): Promise<CuttingListResult> {
        // Custom implementation
        return customCuttingList(design);
      }
    
      // Implement other methods...
    }
    
    // Use adapter
    const adapter = new CustomAdapter();
    const result = await adapter.validateDesign(myDesign);
    
[/code]

#### 7.5.4. React Integration

**Custom Hook:**
[code] 
    import { useState, useCallback } from 'react';
    import { useMCPClient } from '@monolith/react';
    
    export function useDesignValidation() {
      const mcpClient = useMCPClient();
      const [loading, setLoading] = useState(false);
      const [result, setResult] = useState<ValidationResult | null>(null);
      const [error, setError] = useState<Error | null>(null);
    
      const validate = useCallback(async (design: PanelDesign) => {
        setLoading(true);
        setError(null);
    
        try {
          const validationResult = await mcpClient.call('validate_panel_design', {
            design,
            stage: 'production'
          });
          setResult(validationResult);
          return validationResult;
        } catch (err) {
          setError(err as Error);
          throw err;
        } finally {
          setLoading(false);
        }
      }, [mcpClient]);
    
      return { validate, loading, result, error };
    }
    
    // Usage in component
    function DesignEditor() {
      const { validate, loading, result } = useDesignValidation();
    
      const handleValidate = async () => {
        const validationResult = await validate(currentDesign);
        if (!validationResult.valid) {
          alert('Validation failed: ' + validationResult.errors.join(', '));
        }
      };
    
      return (
        <button onClick={handleValidate} disabled={loading}>
          {loading ? 'Validating...' : 'Validate Design'}
        </button>
      );
    }
    
[/code]

### 7.6. Testing Strategy

#### 7.6.1. Unit Tests

**Example Unit Test:**
[code] 
    import { describe, it, expect } from 'vitest';
    import { checkBudget } from '@monolith/shared';
    
    describe('checkBudget', () => {
      it('should pass validation for design within budget', () => {
        const design = createTestDesign({
          materials: [\
            { type: 'plywood', quantity: 50, cost: 2500 }\
          ],
          components: Array(30).fill({}),
          complexity: 80
        });
    
        const result = checkBudget(design, 'production');
    
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    
      it('should fail validation for design exceeding material budget', () => {
        const design = createTestDesign({
          materials: [\
            { type: 'wood', quantity: 600, cost: 30000 }\
          ]
        });
    
        const result = checkBudget(design, 'production');
    
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          expect.stringContaining('เกินงบประมาณ')
        );
      });
    });
    
[/code]

#### 7.6.2. Integration Tests

**Example Integration Test:**
[code] 
    import { describe, it, expect, beforeAll, afterAll } from 'vitest';
    import { MCPClient } from '@monolith/mcp-client';
    import { startTestServer, stopTestServer } from './test-utils';
    
    describe('MCP Server Integration', () => {
      let client: MCPClient;
      let server: any;
    
      beforeAll(async () => {
        server = await startTestServer();
        client = new MCPClient({
          url: 'http://localhost:3100',
          token: 'test-token'
        });
      });
    
      afterAll(async () => {
        await stopTestServer(server);
      });
    
      it('should validate design through MCP server', async () => {
        const design = createTestDesign();
    
        const result = await client.call('validate_panel_design', {
          design,
          stage: 'production'
        });
    
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
      });
    
      it('should generate cutting list', async () => {
        const design = createTestDesign();
    
        const result = await client.call('generate_cutting_list', {
          design
        });
    
        expect(result).toHaveProperty('items');
        expect(result).toHaveProperty('summary');
        expect(result.items).toBeInstanceOf(Array);
      });
    });
    
[/code]

#### 7.6.3. E2E Tests

**Example E2E Test (Playwright):**
[code] 
    import { test, expect } from '@playwright/test';
    
    test.describe('Design Workflow', () => {
      test('should complete full design workflow', async ({ page }) => {
        // 1. Login
        await page.goto('http://localhost:3000/login');
        await page.fill('[name="email"]', 'test@example.com');
        await page.fill('[name="password"]', 'password');
        await page.click('button[type="submit"]');
    
        // 2. Create new design
        await page.goto('http://localhost:3000/designs/new');
        await page.fill('[name="name"]', 'Test Cabinet');
        await page.selectOption('[name="type"]', 'cabinet');
    
        // 3. Configure dimensions
        await page.fill('[name="width"]', '1000');
        await page.fill('[name="height"]', '2000');
        await page.fill('[name="depth"]', '600');
    
        // 4. Select material
        await page.selectOption('[name="material"]', 'plywood');
    
        // 5. Validate
        await page.click('button:has-text("Validate")');
        await expect(page.locator('.validation-success')).toBeVisible();
    
        // 6. Optimize nesting
        await page.click('button:has-text("Optimize")');
        await expect(page.locator('.optimization-result')).toBeVisible();
    
        // 7. Export DXF
        const downloadPromise = page.waitForEvent('download');
        await page.click('button:has-text("Export DXF")');
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.dxf$/);
    
        // 8. Save design
        await page.click('button:has-text("Save")');
        await expect(page.locator('.save-success')).toBeVisible();
      });
    });
    
[/code]

#### 7.6.4. Performance Tests

**Example Performance Test:**
[code] 
    import { describe, it, expect } from 'vitest';
    import { performance } from 'perf_hooks';
    
    describe('Performance Tests', () => {
      it('should optimize nesting within 30 seconds', async () => {
        const panels = generateTestPanels(100);
        const sheets = generateTestSheets(10);
    
        const start = performance.now();
        const result = await optimizeNesting(panels, sheets, 'ga');
        const duration = performance.now() - start;
    
        expect(duration).toBeLessThan(30000); // 30 seconds
        expect(result.efficiency).toBeGreaterThan(70);
      });
    
      it('should handle 1000 concurrent API requests', async () => {
        const requests = Array(1000).fill(null).map(() =>
          fetch('http://localhost:3000/api/designs')
        );
    
        const start = performance.now();
        const responses = await Promise.all(requests);
        const duration = performance.now() - start;
    
        const successCount = responses.filter(r => r.ok).length;
    
        expect(successCount).toBeGreaterThan(950); // 95% success rate
        expect(duration).toBeLessThan(10000); // 10 seconds
      });
    });
    
[/code]

### 7.7. Deployment และ CI/CD

#### 7.7.1. GitHub Actions CI Workflow

**.github/workflows/ci.yml:**
[code] 
    name: CI
    
    on:
      push:
        branches: [main, develop]
      pull_request:
        branches: [main, develop]
    
    jobs:
      test:
        runs-on: ubuntu-latest
    
        services:
          postgres:
            image: timescale/timescaledb:latest-pg15
            env:
              POSTGRES_DB: monolith_test
              POSTGRES_USER: test
              POSTGRES_PASSWORD: test
            ports:
              - 5432:5432
    
          redis:
            image: redis:7-alpine
            ports:
              - 6379:6379
    
        steps:
          - uses: actions/checkout@v3
    
          - name: Setup Node.js
            uses: actions/setup-node@v3
            with:
              node-version: '20'
    
          - name: Setup pnpm
            uses: pnpm/action-setup@v2
            with:
              version: 8
    
          - name: Install dependencies
            run: pnpm install
    
          - name: Type check
            run: pnpm type-check
    
          - name: Lint
            run: pnpm lint
    
          - name: Run tests
            run: pnpm test
            env:
              DATABASE_URL: postgresql://test:test@localhost:5432/monolith_test
              REDIS_URL: redis://localhost:6379
    
          - name: Build
            run: pnpm build
    
          - name: Upload coverage
            uses: codecov/codecov-action@v3
            with:
              files: ./coverage/coverage-final.json
    
      e2e:
        runs-on: ubuntu-latest
    
        steps:
          - uses: actions/checkout@v3
    
          - name: Setup Node.js
            uses: actions/setup-node@v3
            with:
              node-version: '20'
    
          - name: Setup pnpm
            uses: pnpm/action-setup@v2
            with:
              version: 8
    
          - name: Install dependencies
            run: pnpm install
    
          - name: Install Playwright
            run: pnpm exec playwright install --with-deps
    
          - name: Start services
            run: docker-compose up -d
    
          - name: Run E2E tests
            run: pnpm test:e2e
    
          - name: Upload test results
            if: always()
            uses: actions/upload-artifact@v3
            with:
              name: playwright-report
              path: playwright-report/
    
[/code]

#### 7.7.2. Release Workflow

**.github/workflows/release.yml:**
[code] 
    name: Release
    
    on:
      push:
        tags:
          - 'v*'
    
    jobs:
      release:
        runs-on: ubuntu-latest
    
        steps:
          - uses: actions/checkout@v3
    
          - name: Setup Node.js
            uses: actions/setup-node@v3
            with:
              node-version: '20'
    
          - name: Setup pnpm
            uses: pnpm/action-setup@v2
            with:
              version: 8
    
          - name: Install dependencies
            run: pnpm install
    
          - name: Build
            run: pnpm build
    
          - name: Create Release
            uses: actions/create-release@v1
            env:
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
            with:
              tag_name: ${{ github.ref }}
              release_name: Release ${{ github.ref }}
              draft: false
              prerelease: false
    
          - name: Build Docker images
            run: |
              docker build -t monolith/frontend:${{ github.ref_name }} -f Dockerfile.frontend .
              docker build -t monolith/backend:${{ github.ref_name }} -f Dockerfile.backend .
              docker build -t monolith/mcp-server:${{ github.ref_name }} -f Dockerfile.mcp .
    
          - name: Push to Docker Hub
            run: |
              echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
              docker push monolith/frontend:${{ github.ref_name }}
              docker push monolith/backend:${{ github.ref_name }}
              docker push monolith/mcp-server:${{ github.ref_name }}
    
[/code]

#### 7.7.3. Dockerfile Examples

**Dockerfile.frontend:**
[code] 
    FROM node:20-alpine AS builder
    
    WORKDIR /app
    
    # Install pnpm
    RUN npm install -g pnpm
    
    # Copy package files
    COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
    COPY packages/frontend/package.json ./packages/frontend/
    COPY packages/shared/package.json ./packages/shared/
    
    # Install dependencies
    RUN pnpm install --frozen-lockfile
    
    # Copy source code
    COPY packages/frontend ./packages/frontend
    COPY packages/shared ./packages/shared
    
    # Build
    RUN pnpm --filter frontend build
    
    # Production image
    FROM nginx:alpine
    
    COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
    COPY nginx.conf /etc/nginx/nginx.conf
    
    EXPOSE 80
    
    CMD ["nginx", "-g", "daemon off;"]
    
[/code]

**Dockerfile.backend:**
[code] 
    FROM node:20-alpine AS builder
    
    WORKDIR /app
    
    RUN npm install -g pnpm
    
    COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
    COPY packages/backend/package.json ./packages/backend/
    COPY packages/shared/package.json ./packages/shared/
    
    RUN pnpm install --frozen-lockfile
    
    COPY packages/backend ./packages/backend
    COPY packages/shared ./packages/shared
    
    RUN pnpm --filter backend build
    
    FROM node:20-alpine
    
    WORKDIR /app
    
    RUN npm install -g pnpm
    
    COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
    COPY --from=builder /app/packages/backend/package.json ./packages/backend/
    COPY --from=builder /app/packages/shared/package.json ./packages/shared/
    
    RUN pnpm install --frozen-lockfile --prod
    
    COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
    COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
    
    EXPOSE 3000
    
    CMD ["node", "packages/backend/dist/index.js"]
    
[/code]

#### 7.7.4. Kubernetes Deployment

**k8s/deployment.yaml:**
[code] 
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: monolith-backend
    spec:
      replicas: 3
      selector:
        matchLabels:
          app: monolith-backend
      template:
        metadata:
          labels:
            app: monolith-backend
        spec:
          containers:
          - name: backend
            image: monolith/backend:latest
            ports:
            - containerPort: 3000
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: monolith-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: monolith-secrets
                  key: redis-url
            resources:
              requests:
                memory: "512Mi"
                cpu: "500m"
              limits:
                memory: "1Gi"
                cpu: "1000m"
            livenessProbe:
              httpGet:
                path: /health
                port: 3000
              initialDelaySeconds: 30
              periodSeconds: 10
            readinessProbe:
              httpGet:
                path: /ready
                port: 3000
              initialDelaySeconds: 5
              periodSeconds: 5
    
[/code]

# Section 10

apiVersion: v1

kind: Service

metadata:

name: monolith-backend

spec:

selector:

app: monolith-backend

ports:

\- protocol: TCP

port: 80

targetPort: 3000

type: LoadBalancer
[code] 
    
[/code]
