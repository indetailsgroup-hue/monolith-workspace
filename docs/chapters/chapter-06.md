---
num: 6
title: "Technical Specifications"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 2
status: complete
dependencies: "—"
---

# 6\. ข้อกำหนดทางเทคนิค (Technical Specification)

## 6\. ข้อกำหนดทางเทคนิค (Technical Specification)

### 6.1. Technology Stack

#### 6.1.1. Frontend

**Core Technologies:**

  * **Framework** : React 18+ with TypeScript
  * **Build Tool** : Vite
  * **State Management** : Zustand หรือ Redux Toolkit
  * **Routing** : React Router v6
  * **UI Components** : Custom components + Radix UI primitives
  * **Styling** : Tailwind CSS + CSS Modules
  * **3D Graphics** : WebGPU + Three.js (WebGPU backend)
  * **Forms** : React Hook Form + Zod validation
  * **Data Fetching** : TanStack Query (React Query)
  * **Testing** : Vitest + React Testing Library + Playwright



**Additional Libraries:**

  * **Charts** : Recharts หรือ Chart.js
  * **Date/Time** : date-fns
  * **Icons** : Lucide React
  * **Drag & Drop**: dnd-kit
  * **File Upload** : react-dropzone
  * **PDF Generation** : jsPDF + html2canvas
  * **Excel Export** : SheetJS (xlsx)



#### 6.1.2. Backend

**Core Technologies:**

  * **Runtime** : Node.js 20 LTS
  * **Language** : TypeScript 5+
  * **Framework** : Express.js
  * **API** : REST + WebSocket (Socket.io)
  * **MCP Server** : Custom implementation (port 3100)
  * **Authentication** : Passport.js + JWT
  * **Validation** : Zod
  * **ORM** : Prisma
  * **Testing** : Jest + Supertest



**Additional Libraries:**

  * **Logging** : Winston + Morgan
  * **Monitoring** : Prometheus client
  * **Caching** : ioredis
  * **Job Queue** : Bull (Redis-based)
  * **File Processing** : Sharp (images), pdf-lib (PDF)
  * **CAD Export** : Custom DXF/STEP generators
  * **Optimization** : Custom genetic algorithm implementation



#### 6.1.3. Database

**Primary Database:**

  * **RDBMS** : PostgreSQL 15+
  * **Extensions** : PostGIS (spatial data), TimescaleDB (time-series)
  * **Connection Pooling** : PgBouncer



**Caching Layer:**

  * **Cache** : Redis 7+
  * **Use Cases** : Session storage, API caching, job queue, pub/sub



**Document Storage:**

  * **NoSQL** : MongoDB 6+ (optional, สำหรับ design documents)



**Object Storage:**

  * **Storage** : MinIO (S3-compatible) หรือ AWS S3
  * **Use Cases** : Design files, exports, images, backups



#### 6.1.4. Infrastructure

**Containerization:**

  * **Container** : Docker
  * **Orchestration** : Kubernetes (K8s) หรือ Docker Compose (สำหรับ development)



**Cloud Platform (ตัวเลือก):**

  * **AWS** : EC2, RDS, S3, CloudFront, Route 53
  * **Google Cloud** : GCE, Cloud SQL, Cloud Storage, Cloud CDN
  * **Azure** : VMs, Azure Database, Blob Storage, Azure CDN
  * **DigitalOcean** : Droplets, Managed Databases, Spaces



**CI/CD:**

  * **Version Control** : Git + GitHub
  * **CI/CD** : GitHub Actions
  * **Container Registry** : GitHub Container Registry หรือ Docker Hub



**Monitoring และ Logging:**

  * **APM** : New Relic, Datadog หรือ Elastic APM
  * **Logging** : ELK Stack (Elasticsearch, Logstash, Kibana)
  * **Metrics** : Prometheus + Grafana
  * **Error Tracking** : Sentry
  * **Uptime Monitoring** : UptimeRobot หรือ Pingdom



#### 6.1.5. Development Tools

**Code Quality:**

  * **Linter** : ESLint
  * **Formatter** : Prettier
  * **Type Checking** : TypeScript compiler
  * **Pre-commit Hooks** : Husky + lint-staged



**Documentation:**

  * **API Docs** : OpenAPI (Swagger)
  * **Code Docs** : TSDoc
  * **User Docs** : Markdown + Docusaurus



**Project Management:**

  * **Monorepo** : pnpm workspaces
  * **Task Runner** : pnpm scripts
  * **Package Manager** : pnpm



### 6.2. ระบบ Budget-Constrained Design Validation

#### 6.2.1. ภาพรวม

ระบบตรวจสอบงบประมาณวัสดุเป็นส่วนสำคัญของ Monolith ที่ช่วยให้นักออกแบบสามารถตรวจสอบว่าการออกแบบอยู่ในงบประมาณที่กำหนดหรือไม่ ก่อนส่งไปผลิต

#### 6.2.2. STAGE_BUDGETS Configuration

ระบบรองรับการกำหนดงบประมาณตามขั้นตอนการผลิต (stages):
[code] 
    // จาก packages/shared/src/stage-budgets.ts
    
    export const STAGE_BUDGETS = {
      design: {
        maxMaterials: 10,
        maxComponents: 50,
        maxComplexity: 100
      },
      prototype: {
        maxMaterials: 15,
        maxComponents: 100,
        maxComplexity: 200
      },
      production: {
        maxMaterials: 20,
        maxComponents: 200,
        maxComplexity: 500
      }
    };
    
[/code]

#### 6.2.3. MATERIAL_BUDGETS Configuration

ระบบรองรับวัสดุกว่า 20 ชนิด แบ่งเป็น 4 families:

**1\. Rubber Family:**

  * Natural Rubber
  * Synthetic Rubber
  * Silicone Rubber
  * Neoprene



**2\. Wood Family:**

  * Hardwood (Oak, Maple, Walnut, Cherry)
  * Softwood (Pine, Cedar, Fir)
  * Plywood
  * MDF (Medium Density Fiberboard)
  * Particleboard
  * Bamboo



**3\. Composite Family:**

  * Fiberglass
  * Carbon Fiber
  * Laminate
  * Veneer



**4\. Synthetic Family:**

  * Plastic (ABS, PVC, Acrylic)
  * Metal (Aluminum, Steel, Brass)
  * Glass
  * Fabric


[code] 
    export const MATERIAL_BUDGETS = {
      rubber: {
        maxQuantity: 100, // kg
        maxCost: 5000, // บาท
        maxWaste: 10 // %
      },
      wood: {
        maxQuantity: 500, // kg
        maxCost: 20000,
        maxWaste: 15
      },
      composite: {
        maxQuantity: 200,
        maxCost: 30000,
        maxWaste: 12
      },
      synthetic: {
        maxQuantity: 150,
        maxCost: 25000,
        maxWaste: 8
      }
    };
    
[/code]

#### 6.2.4. checkBudget() Function

ฟังก์ชันหลักสำหรับตรวจสอบงบประมาณ:
[code] 
    export function checkBudget(
      design: PanelDesign,
      stage: 'design' | 'prototype' | 'production'
    ): ValidationResult {
      const stageBudget = STAGE_BUDGETS[stage];
      const errors: string[] = [];
      const warnings: string[] = [];
    
      // ตรวจสอบจำนวนวัสดุ
      if (design.materials.length > stageBudget.maxMaterials) {
        errors.push(
          `จำนวนวัสดุ (${design.materials.length}) เกินงบประมาณ (${stageBudget.maxMaterials})`
        );
      }
    
      // ตรวจสอบจำนวนชิ้นส่วน
      if (design.components.length > stageBudget.maxComponents) {
        errors.push(
          `จำนวนชิ้นส่วน (${design.components.length}) เกินงบประมาณ (${stageBudget.maxComponents})`
        );
      }
    
      // ตรวจสอบความซับซ้อน
      const complexity = calculateComplexity(design);
      if (complexity > stageBudget.maxComplexity) {
        errors.push(
          `ความซับซ้อน (${complexity}) เกินงบประมาณ (${stageBudget.maxComplexity})`
        );
      }
    
      // ตรวจสอบงบประมาณวัสดุแต่ละประเภท
      for (const material of design.materials) {
        const family = getMaterialFamily(material.type);
        const budget = MATERIAL_BUDGETS[family];
    
        if (material.quantity > budget.maxQuantity) {
          errors.push(
            `ปริมาณ ${material.type} (${material.quantity} kg) เกินงบประมาณ (${budget.maxQuantity} kg)`
          );
        }
    
        if (material.cost > budget.maxCost) {
          errors.push(
            `ต้นทุน ${material.type} (${material.cost} บาท) เกินงบประมาณ (${budget.maxCost} บาท)`
          );
        }
    
        const wastePercent = (material.waste / material.quantity) * 100;
        if (wastePercent > budget.maxWaste) {
          warnings.push(
            `ของเสีย ${material.type} (${wastePercent.toFixed(1)}%) สูงกว่าที่แนะนำ (${budget.maxWaste}%)`
          );
        }
      }
    
      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
    }
    
[/code]

#### 6.2.5. BudgetError Handling

เมื่อตรวจสอบไม่ผ่าน ระบบจะโยน BudgetError:
[code] 
    export class BudgetError extends Error {
      constructor(
        message: string,
        public errors: string[],
        public warnings: string[]
      ) {
        super(message);
        this.name = 'BudgetError';
      }
    }
    
    // การใช้งาน
    try {
      const result = checkBudget(design, 'production');
      if (!result.valid) {
        throw new BudgetError(
          'การออกแบบไม่ผ่านการตรวจสอบงบประมาณ',
          result.errors,
          result.warnings
        );
      }
    } catch (error) {
      if (error instanceof BudgetError) {
        console.error('Errors:', error.errors);
        console.warn('Warnings:', error.warnings);
        // แสดงข้อความแก่ผู้ใช้
      }
    }
    
[/code]

#### 6.2.6. การปรับแต่งงบประมาณ

ระบบอนุญาตให้แต่ละ tenant ปรับแต่งงบประมาณได้:
[code] 
    interface TenantBudgetConfig {
      tenant_id: string;
      stage_budgets: typeof STAGE_BUDGETS;
      material_budgets: typeof MATERIAL_BUDGETS;
      custom_materials?: {
        [key: string]: MaterialBudget;
      };
    }
    
    // โหลดงบประมาณของ tenant
    async function loadTenantBudget(tenantId: string): Promise<TenantBudgetConfig> {
      const config = await db.tenantBudgetConfig.findUnique({
        where: { tenant_id: tenantId }
      });
    
      return config || getDefaultBudgetConfig();
    }
    
    // ใช้งบประมาณของ tenant
    const tenantBudget = await loadTenantBudget(req.tenantId);
    const result = checkBudget(design, 'production', tenantBudget);
    
[/code]

### 6.3. ระบบ Sheet Nesting และ Bin Packing Optimization

#### 6.3.1. ภาพรวม

ระบบเพิ่มประสิทธิภาพการจัดวางชิ้นส่วนบนแผ่นวัสดุ (sheet nesting) เป็นฟีเจอร์สำคัญที่ช่วยลดของเสียและประหยัดต้นทุนวัสดุ

#### 6.3.2. อัลกอริทึมที่ใช้

**1\. Genetic Algorithm (GA)**

  * ใช้หลักการวิวัฒนาการ
  * เหมาะสำหรับปัญหาที่ซับซ้อน
  * ให้ผลลัพธ์ที่ดีแต่ใช้เวลานาน



**2\. Simulated Annealing (SA)**

  * ใช้หลักการทำความเย็น
  * เร็วกว่า GA
  * เหมาะสำหรับปัญหาขนาดกลาง



**3\. First Fit Decreasing (FFD)**

  * เรียงชิ้นส่วนจากใหญ่ไปเล็ก
  * วางชิ้นส่วนในตำแหน่งแรกที่พอดี
  * เร็วมากแต่ผลลัพธ์อาจไม่ดีที่สุด



**4\. Best Fit Decreasing (BFD)**

  * เรียงชิ้นส่วนจากใหญ่ไปเล็ก
  * วางชิ้นส่วนในตำแหน่งที่เหลือพื้นที่น้อยที่สุด
  * ดีกว่า FFD เล็กน้อย



**5\. Guillotine Cut**

  * ตัดแผ่นวัสดุเป็นสี่เหลี่ยมผืนผ้า
  * เหมาะสำหรับเครื่องตัดที่ตัดเป็นเส้นตรง
  * จำกัดความยืดหยุ่น



#### 6.3.3. Implementation
[code] 
    // Interface สำหรับชิ้นส่วน
    interface Panel {
      id: string;
      width: number;
      height: number;
      quantity: number;
      material: string;
      canRotate: boolean;
    }
    
    // Interface สำหรับแผ่นวัสดุ
    interface SheetStock {
      id: string;
      width: number;
      height: number;
      material: string;
      cost: number;
      available: number;
    }
    
    // Interface สำหรับผลลัพธ์
    interface NestingResult {
      sheets: PlacedSheet[];
      totalSheets: number;
      totalCost: number;
      wastePercentage: number;
      efficiency: number;
      executionTime: number;
    }
    
    interface PlacedSheet {
      sheetId: string;
      panels: PlacedPanel[];
      usedArea: number;
      wasteArea: number;
    }
    
    interface PlacedPanel {
      panelId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rotated: boolean;
    }
    
    // ฟังก์ชันหลัก
    async function optimizeNesting(
      panels: Panel[],
      sheets: SheetStock[],
      algorithm: 'ga' | 'sa' | 'ffd' | 'bfd' | 'guillotine' = 'ga',
      options?: OptimizationOptions
    ): Promise<NestingResult> {
      const startTime = Date.now();
    
      // เลือกอัลกอริทึม
      let result: NestingResult;
      switch (algorithm) {
        case 'ga':
          result = await geneticAlgorithm(panels, sheets, options);
          break;
        case 'sa':
          result = await simulatedAnnealing(panels, sheets, options);
          break;
        case 'ffd':
          result = firstFitDecreasing(panels, sheets);
          break;
        case 'bfd':
          result = bestFitDecreasing(panels, sheets);
          break;
        case 'guillotine':
          result = guillotineCut(panels, sheets);
          break;
      }
    
      result.executionTime = Date.now() - startTime;
      return result;
    }
    
[/code]

**Genetic Algorithm Implementation:**
[code] 
    interface GeneticAlgorithmOptions {
      populationSize: number;
      generations: number;
      mutationRate: number;
      crossoverRate: number;
      elitismRate: number;
    }
    
    async function geneticAlgorithm(
      panels: Panel[],
      sheets: SheetStock[],
      options?: Partial<GeneticAlgorithmOptions>
    ): Promise<NestingResult> {
      const opts: GeneticAlgorithmOptions = {
        populationSize: 100,
        generations: 500,
        mutationRate: 0.1,
        crossoverRate: 0.8,
        elitismRate: 0.1,
        ...options
      };
    
      // สร้าง population เริ่มต้น
      let population = initializePopulation(panels, sheets, opts.populationSize);
    
      // วนลูปตามจำนวน generations
      for (let gen = 0; gen < opts.generations; gen++) {
        // ประเมินความเหมาะสม (fitness)
        const fitness = population.map(individual =>
          evaluateFitness(individual, sheets)
        );
    
        // เลือก elites
        const elites = selectElites(population, fitness, opts.elitismRate);
    
        // สร้าง offspring
        const offspring: Individual[] = [];
        while (offspring.length < opts.populationSize - elites.length) {
          // Selection
          const parent1 = tournamentSelection(population, fitness);
          const parent2 = tournamentSelection(population, fitness);
    
          // Crossover
          let child: Individual;
          if (Math.random() < opts.crossoverRate) {
            child = crossover(parent1, parent2);
          } else {
            child = Math.random() < 0.5 ? parent1 : parent2;
          }
    
          // Mutation
          if (Math.random() < opts.mutationRate) {
            child = mutate(child);
          }
    
          offspring.push(child);
        }
    
        // สร้าง population ใหม่
        population = [...elites, ...offspring];
      }
    
      // เลือกผลลัพธ์ที่ดีที่สุด
      const fitness = population.map(individual =>
        evaluateFitness(individual, sheets)
      );
      const bestIndex = fitness.indexOf(Math.max(...fitness));
      const best = population[bestIndex];
    
      return convertToNestingResult(best, sheets);
    }
    
    // ฟังก์ชันประเมินความเหมาะสม
    function evaluateFitness(individual: Individual, sheets: SheetStock[]): number {
      const result = convertToNestingResult(individual, sheets);
    
      // ความเหมาะสม = efficiency - (waste * penalty)
      const efficiency = result.efficiency;
      const wastePenalty = result.wastePercentage * 0.5;
      const sheetPenalty = result.totalSheets * 0.1;
    
      return efficiency - wastePenalty - sheetPenalty;
    }
    
[/code]

#### 6.3.4. การเพิ่มประสิทธิภาพเพิ่มเติม

**1\. Parallel Processing:**
[code] 
    // ใช้ Web Workers สำหรับ frontend
    // ใช้ Worker Threads สำหรับ backend
    
    import { Worker } from 'worker_threads';
    
    async function optimizeNestingParallel(
      panels: Panel[],
      sheets: SheetStock[],
      numWorkers: number = 4
    ): Promise<NestingResult> {
      const workers: Worker[] = [];
      const promises: Promise<NestingResult>[] = [];
    
      // สร้าง workers
      for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker('./nesting-worker.js');
        workers.push(worker);
    
        promises.push(new Promise((resolve, reject) => {
          worker.on('message', resolve);
          worker.on('error', reject);
          worker.postMessage({ panels, sheets, seed: i });
        }));
      }
    
      // รอผลลัพธ์จากทุก workers
      const results = await Promise.all(promises);
    
      // ปิด workers
      workers.forEach(worker => worker.terminate());
    
      // เลือกผลลัพธ์ที่ดีที่สุด
      return results.reduce((best, current) =>
        current.efficiency > best.efficiency ? current : best
      );
    }
    
[/code]

**2\. Caching:**
[code] 
    // Cache ผลลัพธ์สำหรับ input ที่เหมือนกัน
    import { createHash } from 'crypto';
    
    const nestingCache = new Map<string, NestingResult>();
    
    function getCacheKey(panels: Panel[], sheets: SheetStock[]): string {
      const data = JSON.stringify({ panels, sheets });
      return createHash('sha256').update(data).digest('hex');
    }
    
    async function optimizeNestingWithCache(
      panels: Panel[],
      sheets: SheetStock[]
    ): Promise<NestingResult> {
      const cacheKey = getCacheKey(panels, sheets);
    
      // ตรวจสอบ cache
      if (nestingCache.has(cacheKey)) {
        return nestingCache.get(cacheKey)!;
      }
    
      // คำนวณ
      const result = await optimizeNesting(panels, sheets);
    
      // เก็บใน cache
      nestingCache.set(cacheKey, result);
    
      return result;
    }
    
[/code]

**3\. Progressive Optimization:**
[code] 
    // เริ่มด้วยอัลกอริทึมเร็วแล้วค่อยปรับปรุง
    async function optimizeNestingProgressive(
      panels: Panel[],
      sheets: SheetStock[],
      onProgress?: (result: NestingResult) => void
    ): Promise<NestingResult> {
      // ขั้นที่ 1: FFD (เร็ว)
      let result = firstFitDecreasing(panels, sheets);
      onProgress?.(result);
    
      // ขั้นที่ 2: BFD (ดีกว่าเล็กน้อย)
      result = bestFitDecreasing(panels, sheets);
      onProgress?.(result);
    
      // ขั้นที่ 3: SA (ดีขึ้น)
      result = await simulatedAnnealing(panels, sheets, {
        iterations: 1000
      });
      onProgress?.(result);
    
      // ขั้นที่ 4: GA (ดีที่สุด)
      result = await geneticAlgorithm(panels, sheets, {
        generations: 500
      });
      onProgress?.(result);
    
      return result;
    }
    
[/code]

### 6.4. AI-Driven Design Automation

#### 6.4.1. ภาพรวม

ระบบ AI-Driven Design Automation ใช้ AI agents เพื่อช่วยในการออกแบบเฟอร์นิเจอร์อัตโนมัติ โดยผู้ใช้สามารถอธิบายความต้องการด้วยภาษาธรรมชาติ และ AI จะสร้างการออกแบบที่เหมาะสม

#### 6.4.2. AI Agent Architecture
[code] 
    interface AIAgent {
      id: string;
      name: string;
      type: 'design' | 'optimization' | 'planning' | 'quality';
      capabilities: string[];
      model: string; // LLM model (e.g., 'gpt-4', 'claude-3')
      status: 'idle' | 'busy' | 'error';
    }
    
    interface AgentTask {
      id: string;
      agentId: string;
      type: string;
      input: any;
      output?: any;
      status: 'pending' | 'running' | 'completed' | 'failed';
      createdAt: Date;
      completedAt?: Date;
      error?: string;
    }
    
    // Agent Orchestrator
    class AgentOrchestrator {
      private agents: Map<string, AIAgent> = new Map();
      private tasks: Map<string, AgentTask> = new Map();
    
      registerAgent(agent: AIAgent): void {
        this.agents.set(agent.id, agent);
      }
    
      async executeTask(task: AgentTask): Promise<any> {
        const agent = this.agents.get(task.agentId);
        if (!agent) {
          throw new Error(`Agent ${task.agentId} not found`);
        }
    
        task.status = 'running';
        this.tasks.set(task.id, task);
    
        try {
          const result = await this.runAgent(agent, task);
          task.output = result;
          task.status = 'completed';
          task.completedAt = new Date();
          return result;
        } catch (error) {
          task.status = 'failed';
          task.error = error.message;
          throw error;
        }
      }
    
      private async runAgent(agent: AIAgent, task: AgentTask): Promise<any> {
        // เรียก LLM ผ่าน MCP server
        const response = await fetch('http://localhost:3100/api/agent', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.MCP_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            agent: agent.name,
            task: task.type,
            input: task.input
          })
        });
    
        return await response.json();
      }
    }
    
[/code]

#### 6.4.3. Design Agent
[code] 
    class DesignAgent {
      async generateDesign(requirements: DesignRequirements): Promise<PanelDesign[]> {
        // สร้าง prompt สำหรับ LLM
        const prompt = this.buildPrompt(requirements);
    
        // เรียก LLM
        const response = await this.callLLM(prompt);
    
        // แปลง response เป็น PanelDesign
        const designs = this.parseResponse(response);
    
        // ตรวจสอบความถูกต้อง
        const validDesigns = await this.validateDesigns(designs);
    
        return validDesigns;
      }
    
      private buildPrompt(requirements: DesignRequirements): string {
        return `
          คุณเป็นนักออกแบบเฟอร์นิเจอร์มืออาชีพ กรุณาออกแบบตามความต้องการต่อไปนี้:
    
          ประเภท: ${requirements.type}
          ขนาด: ${requirements.dimensions.width} x ${requirements.dimensions.height} x ${requirements.dimensions.depth} cm
          วัสดุ: ${requirements.materials.join(', ')}
          สี: ${requirements.colors.join(', ')}
          คุณสมบัติพิเศษ: ${requirements.features.join(', ')}
          งบประมาณ: ${requirements.budget} บาท
    
          กรุณาสร้างการออกแบบ 3-5 ตัวเลือกที่:
          1. ตรงตามความต้องการทั้งหมด
          2. อยู่ในงบประมาณ
          3. สามารถผลิตได้จริง
          4. มีความสวยงามและใช้งานได้ดี
    
          สำหรับแต่ละตัวเลือก ให้ระบุ:
          - รายละเอียดการออกแบบ
          - รายการชิ้นส่วนและขนาด
          - วัสดุที่ใช้และปริมาณ
          - ต้นทุนโดยประมาณ
          - ข้อดีและข้อเสีย
          - เหตุผลของการออกแบบ
        `;
      }
    
      private async callLLM(prompt: string): Promise<string> {
        // เรียก LLM API (OpenAI, Anthropic, etc.)
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [\
              {\
                role: 'system',\
                content: 'คุณเป็นนักออกแบบเฟอร์นิเจอร์มืออาชีพที่มีประสบการณ์ 20 ปี'\
              },\
              {\
                role: 'user',\
                content: prompt\
              }\
            ],
            temperature: 0.7,
            max_tokens: 4000
          })
        });
    
        const data = await response.json();
        return data.choices.message.content;
      }
    
      private parseResponse(response: string): PanelDesign[] {
        // แปลง text response เป็น structured data
        // ใช้ regex, JSON parsing, หรือ structured output จาก LLM
    
        // ตัวอย่างการใช้ structured output
        const designs: PanelDesign[] = [];
    
        // Parse และสร้าง PanelDesign objects
        // ...
    
        return designs;
      }
    
      private async validateDesigns(designs: PanelDesign[]): Promise<PanelDesign[]> {
        const validDesigns: PanelDesign[] = [];
    
        for (const design of designs) {
          try {
            // ตรวจสอบผ่าน validate_panel_design tool
            const result = await validatePanelDesign(design);
    
            if (result.valid) {
              validDesigns.push(design);
            }
          } catch (error) {
            console.error(`Design validation failed:`, error);
          }
        }
    
        return validDesigns;
      }
    }
    
[/code]

#### 6.4.4. Optimization Agent
[code] 
    class OptimizationAgent {
      async optimizeDesign(
        design: PanelDesign,
        objectives: OptimizationObjectives
      ): Promise<PanelDesign> {
        // วิเคราะห์การออกแบบปัจจุบัน
        const analysis = await this.analyzeDesign(design);
    
        // สร้างข้อเสนอแนะการปรับปรุง
        const suggestions = await this.generateSuggestions(analysis, objectives);
    
        // ประยุกต์ใช้การปรับปรุง
        const optimizedDesign = await this.applySuggestions(design, suggestions);
    
        // ตรวจสอบว่าดีขึ้นจริง
        const improvement = await this.evaluateImprovement(design, optimizedDesign);
    
        if (improvement.better) {
          return optimizedDesign;
        } else {
          return design;
        }
      }
    
      private async analyzeDesign(design: PanelDesign): Promise<DesignAnalysis> {
        const prompt = `
          วิเคราะห์การออกแบบเฟอร์นิเจอร์ต่อไปนี้และระบุจุดที่สามารถปรับปรุงได้:
    
          ${JSON.stringify(design, null, 2)}
    
          กรุณาวิเคราะห์ในด้าน:
          1. การใช้วัสดุ (มีของเสียมากไหม?)
          2. ต้นทุน (สามารถลดได้ไหม?)
          3. ความแข็งแรง (มีจุดอ่อนไหม?)
          4. ความสวยงาม (สามารถปรับปรุงได้ไหม?)
          5. การผลิต (ผลิตง่ายหรือยาก?)
        `;
    
        const response = await this.callLLM(prompt);
        return this.parseAnalysis(response);
      }
    
      private async generateSuggestions(
        analysis: DesignAnalysis,
        objectives: OptimizationObjectives
      ): Promise<OptimizationSuggestion[]> {
        const prompt = `
          จากการวิเคราะห์:
          ${JSON.stringify(analysis, null, 2)}
    
          และเป้าหมาย:
          ${JSON.stringify(objectives, null, 2)}
    
          กรุณาเสนอวิธีการปรับปรุงการออกแบบ โดยเรียงลำดับตามความสำคัญ
          แต่ละข้อเสนอแนะควรระบุ:
          - สิ่งที่ต้องเปลี่ยน
          - เหตุผล
          - ผลกระทบที่คาดว่าจะได้รับ
          - ความเสี่ยง
        `;
    
        const response = await this.callLLM(prompt);
        return this.parseSuggestions(response);
      }
    }
    
[/code]

#### 6.4.5. Planning Agent
[code] 
    class PlanningAgent {
      async createProductionPlan(
        designs: PanelDesign[],
        resources: ProductionResources
      ): Promise<ProductionPlan> {
        // วิเคราะห์ความต้องการ
        const requirements = this.analyzeRequirements(designs);
    
        // ตรวจสอบทรัพยากร
        const availability = this.checkResourceAvailability(resources, requirements);
    
        // สร้างแผนการผลิต
        const plan = await this.generatePlan(designs, resources, availability);
    
        // เพิ่มประสิทธิภาพแผน
        const optimizedPlan = await this.optimizePlan(plan);
    
        return optimizedPlan;
      }
    
      private async generatePlan(
        designs: PanelDesign[],
        resources: ProductionResources,
        availability: ResourceAvailability
      ): Promise<ProductionPlan> {
        const prompt = `
          สร้างแผนการผลิตสำหรับการออกแบบต่อไปนี้:
    
          การออกแบบ:
          ${JSON.stringify(designs, null, 2)}
    
          ทรัพยากรที่มี:
          ${JSON.stringify(resources, null, 2)}
    
          ความพร้อมใช้งาน:
          ${JSON.stringify(availability, null, 2)}
    
          กรุณาสร้างแผนการผลิตที่:
          1. ใช้ทรัพยากรอย่างมีประสิทธิภาพ
          2. ลดเวลาการผลิตรวม
          3. หลีกเลี่ยง bottlenecks
          4. จัดลำดับงานอย่างเหมาะสม
          5. คำนึงถึงข้อจำกัดของเครื่องจักร
    
          แผนควรระบุ:
          - ลำดับการผลิต
          - เครื่องจักรที่ใช้
          - เวลาเริ่มและสิ้นสุดแต่ละงาน
          - วัสดุที่ต้องเตรียม
          - จุดตรวจสอบคุณภาพ
        `;
    
        const response = await this.callLLM(prompt);
        return this.parsePlan(response);
      }
    }
    
[/code]

#### 6.4.6. Quality Assurance Agent
[code] 
    class QualityAssuranceAgent {
      async inspectDesign(design: PanelDesign): Promise<QualityReport> {
        // ตรวจสอบมาตรฐาน
        const standardsCheck = await this.checkStandards(design);
    
        // ตรวจสอบความปลอดภัย
        const safetyCheck = await this.checkSafety(design);
    
        // ตรวจสอบความทนทาน
        const durabilityCheck = await this.checkDurability(design);
    
        // ตรวจสอบความสวยงาม
        const aestheticsCheck = await this.checkAesthetics(design);
    
        // สร้างรายงาน
        return {
          design_id: design.id,
          standards: standardsCheck,
          safety: safetyCheck,
          durability: durabilityCheck,
          aesthetics: aestheticsCheck,
          overall_score: this.calculateOverallScore([\
            standardsCheck,\
            safetyCheck,\
            durabilityCheck,\
            aestheticsCheck\
          ]),
          recommendations: this.generateRecommendations([\
            standardsCheck,\
            safetyCheck,\
            durabilityCheck,\
            aestheticsCheck\
          ])
        };
      }
    
      private async checkStandards(design: PanelDesign): Promise<CheckResult> {
        const prompt = `
          ตรวจสอบว่าการออกแบบต่อไปนี้เป็นไปตามมาตรฐานอุตสาหกรรมหรือไม่:
    
          ${JSON.stringify(design, null, 2)}
    
          มาตรฐานที่ต้องตรวจสอบ:
          - มาตรฐานขนาด (ISO, DIN)
          - มาตรฐานวัสดุ
          - มาตรฐานการประกอบ
          - มาตรฐานความปลอดภัย
    
          สำหรับแต่ละมาตรฐาน ระบุ:
          - ผ่านหรือไม่ผ่าน
          - รายละเอียด
          - ข้อเสนอแนะ (ถ้าไม่ผ่าน)
        `;
    
        const response = await this.callLLM(prompt);
        return this.parseCheckResult(response);
      }
    }
    
[/code]

### 6.5. ระบบ File Format Interoperability

#### 6.5.1. รูปแบบไฟล์ที่รองรับ

**Input Formats:**

  * JSON (native format)
  * DXF (AutoCAD Drawing Exchange Format)
  * STEP (ISO 10303)
  * IGES (Initial Graphics Exchange Specification)
  * STL (Stereolithography)
  * OBJ (Wavefront)
  * FBX (Filmbox)
  * GLTF/GLB (GL Transmission Format)



**Output Formats:**

  * JSON (native format)
  * DXF (สำหรับ CNC)
  * STEP (สำหรับ CAD)
  * PDF (สำหรับเอกสาร)
  * PNG/JPEG (สำหรับรูปภาพ)
  * CSV/Excel (สำหรับ cutting list)
  * G-code (สำหรับ CNC - future)



#### 6.5.2. DXF Export Implementation
[code] 
    class DXFExporter {
      export(design: PanelDesign): string {
        const dxf = new DXFWriter();
    
        // Header section
        dxf.writeHeader({
          version: 'AC1015', // AutoCAD 2000
          units: 'Millimeters'
        });
    
        // Tables section
        dxf.writeTables();
    
        // Entities section
        dxf.startEntities();
    
        // วาดชิ้นส่วนแต่ละชิ้น
        for (const panel of design.panels) {
          this.drawPanel(dxf, panel);
        }
    
        // วาดรูหมุด/รูเจาะ
        for (const hole of design.holes) {
          this.drawHole(dxf, hole);
        }
    
        // วาดขอบ/edge banding
        for (const edge of design.edges) {
          this.drawEdge(dxf, edge);
        }
    
        dxf.endEntities();
    
        // End of file
        dxf.writeEOF();
    
        return dxf.toString();
      }
    
      private drawPanel(dxf: DXFWriter, panel: Panel): void {
        // วาดสี่เหลี่ยมผืนผ้า
        dxf.addPolyline([\
          [panel.x, panel.y],\
          [panel.x + panel.width, panel.y],\
          [panel.x + panel.width, panel.y + panel.height],\
          [panel.x, panel.y + panel.height],\
          [panel.x, panel.y] // ปิด\
        ], {
          layer: panel.material,
          color: this.getMaterialColor(panel.material)
        });
    
        // เพิ่ม text label
        dxf.addText(panel.id, panel.x + 5, panel.y + 5, {
          height: 10,
          layer: 'LABELS'
        });
      }
    
      private drawHole(dxf: DXFWriter, hole: Hole): void {
        dxf.addCircle(hole.x, hole.y, hole.diameter / 2, {
          layer: 'HOLES',
          color: 1 // Red
        });
      }
    
      private drawEdge(dxf: DXFWriter, edge: Edge): void {
        dxf.addLine(
          [edge.x1, edge.y1],
          [edge.x2, edge.y2],
          {
            layer: 'EDGES',
            color: 3, // Green
            lineweight: 2
          }
        );
      }
    }
    
[/code]

#### 6.5.3. STEP Export Implementation
[code] 
    class STEPExporter {
      export(design: PanelDesign): string {
        const step = new STEPWriter();
    
        // Header
        step.writeHeader({
          description: design.name,
          author: design.author,
          organization: design.organization,
          timestamp: new Date().toISOString()
        });
    
        // Data section
        step.startData();
    
        // สร้าง 3D geometry
        for (const panel of design.panels) {
          const solid = this.createSolid(panel);
          step.addEntity(solid);
        }
    
        // สร้าง assembly
        if (design.panels.length > 1) {
          const assembly = this.createAssembly(design.panels);
          step.addEntity(assembly);
        }
    
        step.endData();
    
        return step.toString();
      }
    
      private createSolid(panel: Panel): STEPEntity {
        // สร้าง box solid
        const box = {
          type: 'MANIFOLD_SOLID_BREP',
          name: panel.id,
          outer_bound: {
            type: 'CLOSED_SHELL',
            faces: this.createBoxFaces(panel)
          }
        };
    
        return box;
      }
    
      private createBoxFaces(panel: Panel): STEPEntity[] {
        const faces: STEPEntity[] = [];
    
        // 6 หน้าของกล่อง
        // Front, Back, Left, Right, Top, Bottom
    
        // Front face
        faces.push({
          type: 'ADVANCED_FACE',
          bounds: [\
            this.createRectangle(\
              [panel.x, panel.y, 0],\
              [panel.x + panel.width, panel.y, 0],\
              [panel.x + panel.width, panel.y + panel.height, 0],\
              [panel.x, panel.y + panel.height, 0]\
            )\
          ],
          surface: { type: 'PLANE' },
          same_sense: true
        });
    
        // ... (ทำซ้ำสำหรับหน้าอื่นๆ)
    
        return faces;
      }
    }
    
[/code]

#### 6.5.4. PDF Export Implementation
[code] 
    import { jsPDF } from 'jspdf';
    import html2canvas from 'html2canvas';
    
    class PDFExporter {
      async export(design: PanelDesign): Promise<Blob> {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });
    
        // หน้าที่ 1: ข้อมูลทั่วไป
        this.addCoverPage(pdf, design);
    
        // หน้าที่ 2: รูปภาพ 3D
        pdf.addPage();
        await this.add3DView(pdf, design);
    
        // หน้าที่ 3: Cutting list
        pdf.addPage();
        this.addCuttingList(pdf, design);
    
        // หน้าที่ 4: รายละเอียดวัสดุ
        pdf.addPage();
        this.addMaterialDetails(pdf, design);
    
        // หน้าที่ 5: ต้นทุน
        pdf.addPage();
        this.addCostBreakdown(pdf, design);
    
        return pdf.output('blob');
      }
    
      private addCoverPage(pdf: jsPDF, design: PanelDesign): void {
        // Title
        pdf.setFontSize(24);
        pdf.text(design.name, 105, 40, { align: 'center' });
    
        // Subtitle    pdf.setFontSize(14);
        pdf.text('เอกสารการออกแบบและการผลิต', 105, 50, { align: 'center' });
    
        // Info
        pdf.setFontSize(12);
        let y = 80;
        pdf.text(`รหัสการออกแบบ: ${design.id}`, 20, y);
        y += 10;
        pdf.text(`ผู้ออกแบบ: ${design.author}`, 20, y);
        y += 10;
        pdf.text(`วันที่: ${new Date(design.createdAt).toLocaleDateString('th-TH')}`, 20, y);
        y += 10;
        pdf.text(`ขนาด: ${design.dimensions.width} x ${design.dimensions.height} x ${design.dimensions.depth} mm`, 20, y);
        y += 10;
        pdf.text(`วัสดุหลัก: ${design.primaryMaterial}`, 20, y);
      }
    
      private async add3DView(pdf: jsPDF, design: PanelDesign): Promise<void> {
        // Capture 3D view จาก canvas
        const canvas = document.getElementById('3d-canvas') as HTMLCanvasElement;
        if (canvas) {
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 20, 20, 170, 120);
        }
      }
    
      private addCuttingList(pdf: jsPDF, design: PanelDesign): void {
        pdf.setFontSize(16);
        pdf.text('รายการตัด (Cutting List)', 20, 20);
    
        // Table header
        pdf.setFontSize(10);
        let y = 35;
        pdf.text('ลำดับ', 20, y);
        pdf.text('ชื่อชิ้นส่วน', 40, y);
        pdf.text('ขนาด (กว้าง x สูง)', 90, y);
        pdf.text('วัสดุ', 140, y);
        pdf.text('จำนวน', 170, y);
    
        // Table rows
        y += 7;
        design.panels.forEach((panel, index) => {
          pdf.text(`${index + 1}`, 20, y);
          pdf.text(panel.name, 40, y);
          pdf.text(`${panel.width} x ${panel.height}`, 90, y);
          pdf.text(panel.material, 140, y);
          pdf.text(`${panel.quantity}`, 170, y);
          y += 7;
        });
      }
    }
    
[/code]

#### 6.5.5. Import/Export API
[code] 
    // API endpoints สำหรับ import/export
    
    // Export DXF
    app.post('/api/designs/:id/export/dxf', authenticate, async (req, res) => {
      try {
        const design = await getDesign(req.params.id, req.tenantId);
        const exporter = new DXFExporter();
        const dxf = exporter.export(design);
    
        res.setHeader('Content-Type', 'application/dxf');
        res.setHeader('Content-Disposition', `attachment; filename="${design.name}.dxf"`);
        res.send(dxf);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Export STEP
    app.post('/api/designs/:id/export/step', authenticate, async (req, res) => {
      try {
        const design = await getDesign(req.params.id, req.tenantId);
        const exporter = new STEPExporter();
        const step = exporter.export(design);
    
        res.setHeader('Content-Type', 'application/step');
        res.setHeader('Content-Disposition', `attachment; filename="${design.name}.step"`);
        res.send(step);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Export PDF
    app.post('/api/designs/:id/export/pdf', authenticate, async (req, res) => {
      try {
        const design = await getDesign(req.params.id, req.tenantId);
        const exporter = new PDFExporter();
        const pdf = await exporter.export(design);
    
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${design.name}.pdf"`);
        res.send(pdf);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Import DXF
    app.post('/api/designs/import/dxf', authenticate, upload.single('file'), async (req, res) => {
      try {
        const dxfContent = req.file.buffer.toString('utf-8');
        const importer = new DXFImporter();
        const design = importer.import(dxfContent);
    
        // บันทึกการออกแบบ
        design.tenant_id = req.tenantId;
        design.author = req.user.name;
        const savedDesign = await saveDesign(design);
    
        res.json(savedDesign);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
[/code]

### 6.6. API Specifications

#### 6.6.1. REST API Overview

**Base URL** : `https://api.monolith.example.com/v1`

**Authentication** : Bearer token ใน Authorization header
[code] 
    Authorization: Bearer YOUR_TOKEN_HERE
    
[/code]

**Response Format** : JSON
[code] 
    {
      "success": true,
      "data": { ... },
      "error": null,
      "meta": {
        "timestamp": "2026-09-18T10:30:00Z",
        "request_id": "req_abc123"
      }
    }
    
[/code]

#### 6.6.2. Design API

**GET /designs**

  * รายการการออกแบบทั้งหมด
  * Query params: `page`, `limit`, `sort`, `filter`
  * Response: `{ designs: Design[], total: number, page: number }`



**GET /designs/:id**

  * รายละเอียดการออกแบบ
  * Response: `Design`



**POST /designs**

  * สร้างการออกแบบใหม่
  * Body: `CreateDesignRequest`
  * Response: `Design`



**PUT /designs/:id**

  * แก้ไขการออกแบบ
  * Body: `UpdateDesignRequest`
  * Response: `Design`



**DELETE /designs/:id**

  * ลบการออกแบบ
  * Response: `{ success: true }`



**POST /designs/:id/validate**

  * ตรวจสอบความถูกต้อง
  * Response: `ValidationResult`



**POST /designs/:id/duplicate**

  * ทำสำเนาการออกแบบ
  * Response: `Design`



#### 6.6.3. Optimization API

**POST /optimize/nesting**

  * เพิ่มประสิทธิภาพการจัดวาง
  * Body: `{ panels: Panel[], sheets: SheetStock[], algorithm?: string }`
  * Response: `NestingResult`



**POST /optimize/cutting**

  * เพิ่มประสิทธิภาพการตัด
  * Body: `{ design_id: string }`
  * Response: `CuttingListResult`



**POST /optimize/cost**

  * เพิ่มประสิทธิภาพต้นทุน
  * Body: `{ design_id: string, objectives: string[] }`
  * Response: `CostOptimizationResult`



#### 6.6.4. Production API

**GET /production/status**

  * สถานะการผลิตปัจจุบัน
  * Response: `ProductionStatus`



**GET /production/machines**

  * รายการเครื่องจักร
  * Response: `Machine[]`



**GET /production/machines/:id**

  * รายละเอียดเครื่องจักร
  * Response: `Machine`



**POST /production/jobs**

  * สร้างงานผลิตใหม่
  * Body: `CreateJobRequest`
  * Response: `ProductionJob`



**GET /production/jobs/:id**

  * รายละเอียดงานผลิต
  * Response: `ProductionJob`



**PUT /production/jobs/:id/status**

  * อัปเดตสถานะงาน
  * Body: `{ status: string }`
  * Response: `ProductionJob`



#### 6.6.5. AI Agent API

**POST /ai/design**

  * ให้ AI ออกแบบ
  * Body: `{ requirements: DesignRequirements }`
  * Response: `{ designs: PanelDesign[] }`



**POST /ai/optimize**

  * ให้ AI เพิ่มประสิทธิภาพ
  * Body: `{ design_id: string, objectives: string[] }`
  * Response: `{ optimized_design: PanelDesign }`



**POST /ai/plan**

  * ให้ AI วางแผนการผลิต
  * Body: `{ design_ids: string[] }`
  * Response: `{ plan: ProductionPlan }`



**POST /ai/inspect**

  * ให้ AI ตรวจสอบคุณภาพ
  * Body: `{ design_id: string }`
  * Response: `{ report: QualityReport }`



#### 6.6.6. Export API

**POST /designs/:id/export/dxf**

  * ส่งออก DXF
  * Response: File download



**POST /designs/:id/export/step**

  * ส่งออก STEP
  * Response: File download



**POST /designs/:id/export/pdf**

  * ส่งออก PDF
  * Response: File download



**POST /designs/:id/export/image**

  * ส่งออกรูปภาพ
  * Body: `{ format: 'png' | 'jpeg', width?: number, height?: number }`
  * Response: File download



### 6.7. Data Models และ Database Schema

#### 6.7.1. Core Data Models

**PanelDesign:**
[code] 
    interface PanelDesign {
      id: string;
      tenant_id: string;
      name: string;
      description?: string;
      type: 'cabinet' | 'wardrobe' | 'bookshelf' | 'desk' | 'custom';
      dimensions: {
        width: number;
        height: number;
        depth: number;
      };
      panels: Panel[];
      materials: Material[];
      hardware: Hardware[];
      cost: Cost;
      author: string;
      status: 'draft' | 'validated' | 'approved' | 'in_production' | 'completed';
      created_at: Date;
      updated_at: Date;
      version: number;
    }
    
    interface Panel {
      id: string;
      name: string;
      width: number;
      height: number;
      thickness: number;
      material: string;
      quantity: number;
      edge_banding?: EdgeBanding[];
      holes?: Hole[];
    }
    
    interface Material {
      id: string;
      type: string;
      family: 'rubber' | 'wood' | 'composite' | 'synthetic';
      quantity: number;
      unit: 'kg' | 'm2' | 'pcs';
      cost_per_unit: number;
      total_cost: number;
      waste: number;
    }
    
    interface Hardware {
      id: string;
      type: 'hinge' | 'handle' | 'drawer_slide' | 'shelf_pin' | 'other';
      name: string;
      quantity: number;
      cost_per_unit: number;
      total_cost: number;
    }
    
    interface Cost {
      materials: number;
      hardware: number;
      labor: number;
      overhead: number;
      total: number;
      selling_price?: number;
      profit_margin?: number;
    }
    
[/code]

#### 6.7.2. Database Schema (PostgreSQL)
[code] 
    -- Tenants table
    CREATE TABLE tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      domain VARCHAR(255) UNIQUE NOT NULL,
      subscription_plan VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL,
      stripe_customer_id VARCHAR(255),
      settings JSONB,
      quotas JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Users table
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, email)
    );
    
    -- Designs table
    CREATE TABLE designs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      type VARCHAR(50) NOT NULL,
      dimensions JSONB NOT NULL,
      data JSONB NOT NULL,
      cost JSONB,
      author_id UUID NOT NULL REFERENCES users(id),
      status VARCHAR(50) NOT NULL,
      version INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Materials table
    CREATE TABLE materials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(100) NOT NULL,
      family VARCHAR(50) NOT NULL,
      unit VARCHAR(20) NOT NULL,
      cost_per_unit DECIMAL(10, 2) NOT NULL,
      stock_quantity DECIMAL(10, 2),
      min_stock_quantity DECIMAL(10, 2),
      supplier VARCHAR(255),
      properties JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Machines table
    CREATE TABLE machines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL,
      capabilities JSONB,
      specifications JSONB,
      location VARCHAR(255),
      last_maintenance TIMESTAMP,
      next_maintenance TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Production jobs table
    CREATE TABLE production_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      design_id UUID NOT NULL REFERENCES designs(id),
      machine_id UUID REFERENCES machines(id),
      status VARCHAR(50) NOT NULL,
      priority INTEGER DEFAULT 0,
      quantity INTEGER NOT NULL,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      estimated_duration INTEGER,
      actual_duration INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Sensor data table (TimescaleDB)
    CREATE TABLE sensor_data (
      time TIMESTAMPTZ NOT NULL,
      machine_id UUID NOT NULL REFERENCES machines(id),
      sensor_type VARCHAR(50) NOT NULL,
      value DOUBLE PRECISION NOT NULL,
      unit VARCHAR(20),
      metadata JSONB
    );
    
    -- Convert to hypertable for time-series data
    SELECT create_hypertable('sensor_data', 'time');
    
    -- Indexes
    CREATE INDEX idx_designs_tenant ON designs(tenant_id);
    CREATE INDEX idx_designs_author ON designs(author_id);
    CREATE INDEX idx_designs_status ON designs(status);
    CREATE INDEX idx_designs_created ON designs(created_at DESC);
    
    CREATE INDEX idx_users_tenant ON users(tenant_id);
    CREATE INDEX idx_users_email ON users(email);
    
    CREATE INDEX idx_materials_tenant ON materials(tenant_id);
    CREATE INDEX idx_materials_type ON materials(type);
    
    CREATE INDEX idx_machines_tenant ON machines(tenant_id);
    CREATE INDEX idx_machines_status ON machines(status);
    
    CREATE INDEX idx_jobs_tenant ON production_jobs(tenant_id);
    CREATE INDEX idx_jobs_design ON production_jobs(design_id);
    CREATE INDEX idx_jobs_machine ON production_jobs(machine_id);
    CREATE INDEX idx_jobs_status ON production_jobs(status);
    
    CREATE INDEX idx_sensor_machine_time ON sensor_data(machine_id, time DESC);
    
    -- Row Level Security
    ALTER TABLE designs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
    ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE production_jobs ENABLE ROW LEVEL SECURITY;
    
    -- Policies
    CREATE POLICY tenant_isolation_designs ON designs
      USING (tenant_id = current_setting('app.current_tenant')::UUID);
    
    CREATE POLICY tenant_isolation_users ON users
      USING (tenant_id = current_setting('app.current_tenant')::UUID);
    
    CREATE POLICY tenant_isolation_materials ON materials
      USING (tenant_id = current_setting('app.current_tenant')::UUID);
    
    CREATE POLICY tenant_isolation_machines ON machines
      USING (tenant_id = current_setting('app.current_tenant')::UUID);
    
    CREATE POLICY tenant_isolation_jobs ON production_jobs
      USING (tenant_id = current_setting('app.current_tenant')::UUID);
    
[/code]
