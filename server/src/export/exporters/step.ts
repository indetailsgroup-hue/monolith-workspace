/**
 * STEP (ISO 10303) Exporter
 *
 * Step 9: Server-side STEP file generation for CAD interoperability
 *
 * Generates STEP AP214 format files for 3D CAD exchange.
 * Exports cabinet panels as 3D box geometries with proper coordinate systems.
 *
 * STEP Format: ISO 10303-21 (Clear text encoding)
 * Application Protocol: AP214 (Automotive Design - commonly used for general 3D)
 */

import { sha256Hex } from '../../storage/cas.js';
import type { ArtifactBundle, ArtifactFile } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

interface StepPanel {
  id: string;
  name: string;
  width: number;   // X dimension (mm)
  height: number;  // Y dimension (mm)
  thickness: number; // Z dimension (mm)
  position: {
    x: number;
    y: number;
    z: number;
  };
  cabinetId: string;
  cabinetName: string;
  material: string;
}

interface StepCabinet {
  id: string;
  name: string;
  panels: StepPanel[];
  position: {
    x: number;
    y: number;
    z: number;
  };
}

// ============================================================================
// Exporter
// ============================================================================

export function exportStep(
  bundle: ArtifactBundle,
  jobName: string,
  options?: Record<string, unknown>
): ArtifactFile[] {
  // Extract snapshot from bundle (contains cabinet and panel data)
  const snapshotFile = bundle.files.find((f) => f.name === 'snapshot.json');
  if (!snapshotFile) {
    throw new Error('Bundle missing snapshot.json');
  }

  const snapshot = JSON.parse(snapshotFile.content);
  const cabinets = snapshot.cabinets || [];

  // Build the list of all panels with their 3D positions
  const allPanels: StepPanel[] = [];

  for (const cabinet of cabinets) {
    const cabinetPos = {
      x: cabinet.x || cabinet.posX || 0,
      y: cabinet.y || cabinet.posY || 0,
      z: cabinet.z || cabinet.posZ || 0,
    };

    const panels = cabinet.panels || [];
    for (const panel of panels) {
      allPanels.push({
        id: panel.id || `${cabinet.id}-${panel.label}`,
        name: panel.label || panel.type || 'Panel',
        width: panel.computedW || panel.width || 0,
        height: panel.computedH || panel.height || 0,
        thickness: panel.computedT || panel.thickness || 18,
        position: {
          x: cabinetPos.x + (panel.x || panel.posX || 0),
          y: cabinetPos.y + (panel.y || panel.posY || 0),
          z: cabinetPos.z + (panel.z || panel.posZ || 0),
        },
        cabinetId: cabinet.id,
        cabinetName: cabinet.name || cabinet.displayName || cabinet.id,
        material: panel.material || cabinet.coreMaterial || 'MDF',
      });
    }

    // Add doors/drawer fronts as panels
    const compartments = cabinet.compartments || [];
    for (const comp of compartments) {
      if (comp.door) {
        allPanels.push({
          id: `${cabinet.id}-door-${comp.id}`,
          name: 'Door',
          width: comp.door.width || 0,
          height: comp.door.height || 0,
          thickness: comp.door.thickness || 18,
          position: {
            x: cabinetPos.x + (comp.door.x || comp.door.posX || 0),
            y: cabinetPos.y + (comp.door.y || comp.door.posY || 0),
            z: cabinetPos.z + (comp.door.z || comp.door.posZ || 0),
          },
          cabinetId: cabinet.id,
          cabinetName: cabinet.name || cabinet.displayName || cabinet.id,
          material: cabinet.frontMaterial || cabinet.coreMaterial || 'MDF',
        });
      }
      if (comp.drawerFront) {
        allPanels.push({
          id: `${cabinet.id}-drawer-${comp.id}`,
          name: 'Drawer Front',
          width: comp.drawerFront.width || 0,
          height: comp.drawerFront.height || 0,
          thickness: comp.drawerFront.thickness || 18,
          position: {
            x: cabinetPos.x + (comp.drawerFront.x || comp.drawerFront.posX || 0),
            y: cabinetPos.y + (comp.drawerFront.y || comp.drawerFront.posY || 0),
            z: cabinetPos.z + (comp.drawerFront.z || comp.drawerFront.posZ || 0),
          },
          cabinetId: cabinet.id,
          cabinetName: cabinet.name || cabinet.displayName || cabinet.id,
          material: cabinet.frontMaterial || cabinet.coreMaterial || 'MDF',
        });
      }
    }
  }

  // Generate STEP content
  const stepContent = generateStepFile(allPanels, jobName);
  const fileName = `${jobName}.step`;
  const hashHex = sha256Hex(stepContent);

  return [
    {
      name: fileName,
      content: stepContent,
      contentType: 'application/step',
      hashHex,
    },
  ];
}

// ============================================================================
// STEP File Generation
// ============================================================================

/**
 * Generate a STEP AP214 file containing all panels as box geometries.
 *
 * STEP file structure:
 * - HEADER section: File metadata
 * - DATA section: Entity instances defining geometry
 *
 * Each panel is represented as a MANIFOLD_SOLID_BREP with a CLOSED_SHELL
 * containing 6 ADVANCED_FACE entities (one per box face).
 */
function generateStepFile(panels: StepPanel[], jobName: string): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

  // STEP file header
  lines.push('ISO-10303-21;');
  lines.push('HEADER;');
  lines.push(`FILE_DESCRIPTION(('Cabinet Export - ${escapeStepString(jobName)}'),'2;1');`);
  lines.push(`FILE_NAME('${escapeStepString(jobName)}.step','${timestamp}',('IIMOS'),('IIMOS Cabinet System'),'IIMOS STEP Exporter','IIMOS','');`);
  lines.push("FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));");
  lines.push('ENDSEC;');
  lines.push('DATA;');

  // Entity counter for STEP instance IDs
  let entityId = 1;

  // Create shared geometric context entities (used by all geometries)
  const contextEntities = createGeometricContext(entityId);
  lines.push(...contextEntities.lines);
  entityId = contextEntities.nextId;

  // Store references to shared entities
  const geometricContextId = contextEntities.geometricContextId;
  const lengthUnitId = contextEntities.lengthUnitId;

  // Create product definition context
  const productContextEntities = createProductContext(entityId);
  lines.push(...productContextEntities.lines);
  entityId = productContextEntities.nextId;
  const productContextId = productContextEntities.productContextId;
  const productDefinitionContextId = productContextEntities.productDefinitionContextId;

  // Create each panel as a solid body
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const panelEntities = createPanelSolid(
      entityId,
      panel,
      geometricContextId,
      productContextId,
      productDefinitionContextId,
      i + 1
    );
    lines.push(...panelEntities.lines);
    entityId = panelEntities.nextId;
  }

  lines.push('ENDSEC;');
  lines.push('END-ISO-10303-21;');

  return lines.join('\n');
}

// ============================================================================
// STEP Entity Generators
// ============================================================================

interface EntityResult {
  lines: string[];
  nextId: number;
  [key: string]: any;
}

/**
 * Create the geometric representation context entities.
 * These define the coordinate system, units, and representation context.
 */
function createGeometricContext(startId: number): EntityResult {
  const lines: string[] = [];
  let id = startId;

  // Length unit (millimeters)
  const lengthUnitId = id++;
  lines.push(`#${lengthUnitId}=( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );`);

  // Plane angle unit (radians)
  const angleUnitId = id++;
  lines.push(`#${angleUnitId}=( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) );`);

  // Solid angle unit (steradians)
  const solidAngleUnitId = id++;
  lines.push(`#${solidAngleUnitId}=( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() );`);

  // Uncertainty measure
  const uncertaintyId = id++;
  lines.push(`#${uncertaintyId}=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${lengthUnitId},'distance_accuracy_value','edge curve and target accuracy');`);

  // Unit context (combines all units)
  const unitContextId = id++;
  lines.push(`#${unitContextId}=( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertaintyId})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnitId},#${angleUnitId},#${solidAngleUnitId})) REPRESENTATION_CONTEXT('Context','3D Context') );`);

  return {
    lines,
    nextId: id,
    geometricContextId: unitContextId,
    lengthUnitId,
  };
}

/**
 * Create product and product definition context entities.
 */
function createProductContext(startId: number): EntityResult {
  const lines: string[] = [];
  let id = startId;

  // Application context
  const appContextId = id++;
  lines.push(`#${appContextId}=APPLICATION_CONTEXT('core data for automotive mechanical design processes');`);

  // Application protocol definition
  const appProtoId = id++;
  lines.push(`#${appProtoId}=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appContextId});`);

  // Product context
  const productContextId = id++;
  lines.push(`#${productContextId}=PRODUCT_CONTEXT('',#${appContextId},'mechanical');`);

  // Product definition context
  const productDefContextId = id++;
  lines.push(`#${productDefContextId}=PRODUCT_DEFINITION_CONTEXT('part definition',#${appContextId},'design');`);

  return {
    lines,
    nextId: id,
    productContextId,
    productDefinitionContextId: productDefContextId,
    applicationContextId: appContextId,
  };
}

/**
 * Create a panel as a solid BREP (box geometry).
 *
 * A box in STEP is represented as a MANIFOLD_SOLID_BREP containing:
 * - CLOSED_SHELL with 6 faces
 * - Each face is an ADVANCED_FACE with a PLANE surface
 * - Edges connect the vertices
 */
function createPanelSolid(
  startId: number,
  panel: StepPanel,
  geometricContextId: number,
  productContextId: number,
  productDefinitionContextId: number,
  panelIndex: number
): EntityResult {
  const lines: string[] = [];
  let id = startId;

  const { width, height, thickness, position, name, id: panelId, cabinetName, material } = panel;
  const productName = `${cabinetName} - ${name}`;

  // Box corner coordinates
  const x0 = position.x;
  const y0 = position.y;
  const z0 = position.z;
  const x1 = position.x + width;
  const y1 = position.y + height;
  const z1 = position.z + thickness;

  // Create the 8 vertices of the box
  const vertices: number[] = [];
  const vertexCoords = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], // Bottom face
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], // Top face
  ];

  // Create cartesian points for vertices
  const pointIds: number[] = [];
  for (const [x, y, z] of vertexCoords) {
    const pointId = id++;
    pointIds.push(pointId);
    lines.push(`#${pointId}=CARTESIAN_POINT('',(${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}));`);
  }

  // Create vertex points
  const vertexIds: number[] = [];
  for (let i = 0; i < 8; i++) {
    const vertexId = id++;
    vertexIds.push(vertexId);
    lines.push(`#${vertexId}=VERTEX_POINT('',#${pointIds[i]});`);
  }

  // Direction vectors for the coordinate system
  const dirZId = id++;
  lines.push(`#${dirZId}=DIRECTION('',(0.,0.,1.));`);
  const dirXId = id++;
  lines.push(`#${dirXId}=DIRECTION('',(1.,0.,0.));`);
  const dirYId = id++;
  lines.push(`#${dirYId}=DIRECTION('',(0.,1.,0.));`);
  const dirNegZId = id++;
  lines.push(`#${dirNegZId}=DIRECTION('',(0.,0.,-1.));`);
  const dirNegXId = id++;
  lines.push(`#${dirNegXId}=DIRECTION('',(-1.,0.,0.));`);
  const dirNegYId = id++;
  lines.push(`#${dirNegYId}=DIRECTION('',(0.,-1.,0.));`);

  // Create the 6 faces of the box
  // Each face needs: plane surface, face outer bound, edges

  // Helper to create an edge between two vertices
  function createEdgeCurve(v1: number, v2: number, p1: number, p2: number): number {
    const lineId = id++;
    const vecId = id++;
    // Direction from p1 to p2
    const dx = vertexCoords[v2][0] - vertexCoords[v1][0];
    const dy = vertexCoords[v2][1] - vertexCoords[v1][1];
    const dz = vertexCoords[v2][2] - vertexCoords[v1][2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    lines.push(`#${vecId}=VECTOR('',#${dirZId},${len.toFixed(4)});`); // Placeholder direction
    lines.push(`#${lineId}=LINE('',#${pointIds[v1]},#${vecId});`);

    const edgeId = id++;
    lines.push(`#${edgeId}=EDGE_CURVE('',#${vertexIds[v1]},#${vertexIds[v2]},#${lineId},.T.);`);
    return edgeId;
  }

  // Create edges for the box (12 edges total)
  // Bottom face edges: 0-1, 1-2, 2-3, 3-0
  // Top face edges: 4-5, 5-6, 6-7, 7-4
  // Vertical edges: 0-4, 1-5, 2-6, 3-7
  const edgeIndices = [
    [0, 1], [1, 2], [2, 3], [3, 0], // Bottom
    [4, 5], [5, 6], [6, 7], [7, 4], // Top
    [0, 4], [1, 5], [2, 6], [3, 7], // Verticals
  ];

  const edgeIds: number[] = [];
  for (const [v1, v2] of edgeIndices) {
    edgeIds.push(createEdgeCurve(v1, v2, pointIds[v1], pointIds[v2]));
  }

  // Create oriented edges and face bounds for each face
  function createFace(
    planePointIdx: number,
    normalDir: number,
    refDir: number,
    edgeIdxs: [number, boolean][],
    faceName: string
  ): number {
    // Plane surface
    const axisId = id++;
    lines.push(`#${axisId}=AXIS2_PLACEMENT_3D('',#${pointIds[planePointIdx]},#${normalDir},#${refDir});`);
    const planeId = id++;
    lines.push(`#${planeId}=PLANE('',#${axisId});`);

    // Oriented edges
    const orientedEdgeIds: number[] = [];
    for (const [edgeIdx, orientation] of edgeIdxs) {
      const orientedEdgeId = id++;
      orientedEdgeIds.push(orientedEdgeId);
      lines.push(`#${orientedEdgeId}=ORIENTED_EDGE('',*,*,#${edgeIds[edgeIdx]},${orientation ? '.T.' : '.F.'});`);
    }

    // Edge loop
    const edgeLoopId = id++;
    lines.push(`#${edgeLoopId}=EDGE_LOOP('',(${orientedEdgeIds.map(i => '#' + i).join(',')}));`);

    // Face bound
    const faceBoundId = id++;
    lines.push(`#${faceBoundId}=FACE_OUTER_BOUND('',#${edgeLoopId},.T.);`);

    // Advanced face
    const faceId = id++;
    lines.push(`#${faceId}=ADVANCED_FACE('${faceName}',(#${faceBoundId}),#${planeId},.T.);`);

    return faceId;
  }

  // Create the 6 faces
  // Bottom face (Z=z0): vertices 0,1,2,3, normal -Z
  const bottomFaceId = createFace(0, dirNegZId, dirXId, [[0, true], [1, true], [2, true], [3, true]], 'Bottom');

  // Top face (Z=z1): vertices 4,5,6,7, normal +Z
  const topFaceId = createFace(4, dirZId, dirXId, [[4, true], [5, true], [6, true], [7, true]], 'Top');

  // Front face (Y=y0): vertices 0,1,5,4, normal -Y
  const frontFaceId = createFace(0, dirNegYId, dirXId, [[0, true], [9, true], [4, false], [8, false]], 'Front');

  // Back face (Y=y1): vertices 2,3,7,6, normal +Y
  const backFaceId = createFace(2, dirYId, dirNegXId, [[2, true], [11, true], [6, false], [10, false]], 'Back');

  // Left face (X=x0): vertices 0,3,7,4, normal -X
  const leftFaceId = createFace(0, dirNegXId, dirYId, [[3, false], [11, true], [7, false], [8, true]], 'Left');

  // Right face (X=x1): vertices 1,2,6,5, normal +X
  const rightFaceId = createFace(1, dirXId, dirYId, [[1, true], [10, true], [5, false], [9, false]], 'Right');

  // Closed shell
  const closedShellId = id++;
  lines.push(`#${closedShellId}=CLOSED_SHELL('',(#${bottomFaceId},#${topFaceId},#${frontFaceId},#${backFaceId},#${leftFaceId},#${rightFaceId}));`);

  // Manifold solid BREP
  const solidId = id++;
  lines.push(`#${solidId}=MANIFOLD_SOLID_BREP('${escapeStepString(name)}',#${closedShellId});`);

  // Shape representation
  const shapeRepId = id++;
  lines.push(`#${shapeRepId}=ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${solidId}),#${geometricContextId});`);

  // Product
  const productId = id++;
  lines.push(`#${productId}=PRODUCT('${escapeStepString(panelId)}','${escapeStepString(productName)}','Panel: ${escapeStepString(material)}',(#${productContextId}));`);

  // Product definition formation
  const pdfId = id++;
  lines.push(`#${pdfId}=PRODUCT_DEFINITION_FORMATION('','',#${productId});`);

  // Product definition
  const pdId = id++;
  lines.push(`#${pdId}=PRODUCT_DEFINITION('design','',#${pdfId},#${productDefinitionContextId});`);

  // Product definition shape
  const pdsId = id++;
  lines.push(`#${pdsId}=PRODUCT_DEFINITION_SHAPE('','Shape for ${escapeStepString(name)}',#${pdId});`);

  // Shape definition representation
  const sdrId = id++;
  lines.push(`#${sdrId}=SHAPE_DEFINITION_REPRESENTATION(#${pdsId},#${shapeRepId});`);

  return {
    lines,
    nextId: id,
    solidId,
    productId,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Escape a string for use in STEP file.
 * STEP uses single quotes and escapes them by doubling.
 */
function escapeStepString(str: string): string {
  if (!str) return '';
  return str.replace(/'/g, "''").replace(/\\/g, '\\\\');
}
