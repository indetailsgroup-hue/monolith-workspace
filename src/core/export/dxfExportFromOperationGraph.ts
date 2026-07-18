/**
 * dxfExportFromOperationGraph.ts - DXF Export via OperationGraph
 *
 * AGENT-T008: DXF export MUST come from OperationGraph (manufacturing intent)
 * GATE10: All DXF exports are validated through G10 safety gate
 *
 * This module provides the bridge between:
 * - FactoryPacket → OperationGraph → DXF → G10 Validation
 *
 * Ensuring that DXF output exactly matches the G-code that will be generated.
 *
 * @version 1.1.0 - G10 Safety Gate Integration
 */

import JSZip from 'jszip';
import { buildOperationGraph, hasBuildErrors } from '../../cnc/mapping/buildOperationGraph';
import { markPacketAsValidated } from '../../cnc/mapping/g9AssertValidPacket';
import { getMachineProfile } from '../../cnc/machine';
import type { MachineId, MachineProfile } from '../../cnc/machine';
import type { OperationGraph } from '../../cnc/operation/operationTypes';
import type { FactoryPacket } from '../../factory/packet/types';
import {
    operationGraphToDxf,
    validateOperationGraphForDxf,
    type OperationGraphDxfOptions,
    type DxfValidationResult,
} from './operationGraphToDxf';
import {
    assertDxfSafety,
    createOperationGraphProvenance,
    type SafeDxf,
    type DxfProvenanceOperationGraph,
    type G10Result,
} from '../gate/gate10DxfSafety';
import {
    validateDxfSemantic,
    type SemanticValidationResult,
    type PanelContext,
} from '../gate/gate10_2DxfSemantic';
import {
    validateMachineDialect,
    type MachineDialectResult,
} from '../gate/gate10_3MachineDialect';
import {
    SHADOW_MODE_NOT_FOR_PRODUCTION,
    NOT_FOR_PRODUCTION_FILE,
    NOT_FOR_PRODUCTION_NOTICE,
} from '../config/shadowMode';

// ============================================
// TYPES
// ============================================

export interface PanelDxfResult {
    panelId: string;
    panelName: string;
    filename: string;
    content: string;
    /**
     * G10-verified safe DXF content — ONLY present when G10 passes.
     * ADR-065: never forged from raw content; absent means the panel
     * failed G10 and must not reach the machine.
     */
    safeDxf?: SafeDxf;
    operationCount: number;
    validation: DxfValidationResult;
    /** G10 provenance tracking */
    provenance: DxfProvenanceOperationGraph;
    /** G10 gate result */
    g10Result: G10Result;
    /** G10.2 semantic validation result */
    semanticResult: SemanticValidationResult;
    /** G10.3 machine dialect validation result */
    dialectResult: MachineDialectResult;
}

export interface DxfExportResult {
    ok: true;
    panels: PanelDxfResult[];
    totalOperations: number;
    machineId: string;
    warnings: string[];
    /** G10 gate overall status */
    g10Status: {
        /** All panels passed G10 */
        allPassed: boolean;
        /** Count of panels that passed G10 */
        passedCount: number;
        /** Total panel count */
        totalCount: number;
    };
}

export interface DxfExportError {
    ok: false;
    error: string;
    details?: string[];
}

export type DxfExportFromPacketResult = DxfExportResult | DxfExportError;

export interface DxfExportOptions extends OperationGraphDxfOptions {
    /** Machine ID to build OperationGraph for */
    machineId?: string;
    /** Selected panel IDs (if empty, exports all) */
    selectedPanelIds?: string[];
    /** Progress callback */
    onPanelProgress?: (panelId: string, panelName: string, index: number, total: number) => void;
}

// ============================================
// MAIN EXPORT FUNCTION
// ============================================

/**
 * Export DXF files from FactoryPacket via OperationGraph
 *
 * THIS IS THE SOURCE OF TRUTH FOR DXF EXPORT.
 * - Uses OperationGraph (manufacturing intent)
 * - NOT Cabinet geometry or 3D mesh data
 * - Ensures DXF matches G-code output exactly
 *
 * @param packet - Verified FactoryPacket from buildFactoryPacket
 * @param options - Export options
 * @returns DXF export result or error
 */
export async function exportDxfFromPacket(
    packet: FactoryPacket,
    options: DxfExportOptions = {}
): Promise<DxfExportFromPacketResult> {
    const {
        machineId = 'KDT-6000',
        selectedPanelIds,
        onPanelProgress,
        ...dxfOptions
    } = options;

    // 1. Validate packet
    if (!packet) {
        return { ok: false, error: 'No packet provided' };
    }

    if (!packet.drillMap) {
        return { ok: false, error: 'Packet has no drill map - cannot generate operations' };
    }

    // 2. Get machine profile
    const machine = getMachineProfile(machineId as MachineId);
    if (!machine) {
        return { ok: false, error: `Unknown machine: ${machineId}` };
    }

    // 3. Build OperationGraph from packet
    // G9: Mark packet as validated (trusted internal path)
    const validatedPacket = markPacketAsValidated(packet);
    const buildResult = buildOperationGraph(validatedPacket, machine);

    if (hasBuildErrors(buildResult)) {
        return {
            ok: false,
            error: 'Failed to build OperationGraph',
            details: buildResult.errors,
        };
    }

    const graph = buildResult.graph;
    const warnings = [...buildResult.warnings];

    // 4. Filter panels if selectedPanelIds is provided
    const panelIds = packet.drillMap.panels.map(p => p.panelId);
    const targetPanelIds = selectedPanelIds && selectedPanelIds.length > 0
        ? panelIds.filter(id => selectedPanelIds.includes(id))
        : panelIds;

    if (targetPanelIds.length === 0) {
        return { ok: false, error: 'No panels to export' };
    }

    // 5. Generate DXF for each panel
    const panels: PanelDxfResult[] = [];
    let totalOperations = 0;

    for (let i = 0; i < targetPanelIds.length; i++) {
        const panelId = targetPanelIds[i];
        const panelData = packet.drillMap.panels.find(p => p.panelId === panelId);
        if (!panelData) continue;

        // Use role or panelId as display name (PacketDrillPanel has no panelName)
        const panelName = panelData.role || panelId;

        // Filter operations for this panel
        const panelOperations = graph.operations.filter(op => {
            return op.workpieceContext?.panelId === panelId;
        });

        // Create panel-specific graph
        const panelGraph: OperationGraph = {
            ...graph,
            operations: panelOperations,
            metadata: {
                ...graph.metadata,
                panelId,
            },
        };

        // Validate panel graph
        const validation = validateOperationGraphForDxf(panelGraph);

        // G10.3: Machine dialect validation
        const dialectResult = validateMachineDialect(panelGraph, machine);

        // Collect G10.3 warnings and errors
        for (const issue of dialectResult.issues) {
            const prefix = issue.severity === 'BLOCK' ? '[G10.3 BLOCK]' : '[G10.3 WARN]';
            warnings.push(`${prefix} ${panelId}: ${issue.message}`);
        }

        // G10.2: Semantic validation
        // PacketDrillPanel.dimensions is [w, h, t] tuple
        const [panelWidth, panelHeight, panelThickness] = panelData.dimensions;
        const panelContext: PanelContext = {
            panelId,
            width: panelWidth,
            height: panelHeight,
            thickness: panelThickness,
        };
        const semanticResult = validateDxfSemantic(panelGraph, { panel: panelContext });

        // Collect semantic warnings and errors
        for (const issue of semanticResult.issues) {
            const prefix = issue.severity === 'BLOCK' ? '[G10.2 BLOCK]' : '[G10.2 WARN]';
            warnings.push(`${prefix} ${panelId}: ${issue.message}`);
        }

        // Look up edge banding data from cut list
        const cutListRow = packet.cutList?.rows?.find(
            (row) => row.partId === panelId || row.partId === panelId.slice(0, 8)
        );
        const edgeBandingOption = cutListRow?.edgeBanding
            ? {
                includeEdgeBanding: true,
                edgeBanding: {
                    left: cutListRow.edgeBanding[0] > 0 ? { thickness: cutListRow.edgeBanding[0] } : undefined,
                    right: cutListRow.edgeBanding[1] > 0 ? { thickness: cutListRow.edgeBanding[1] } : undefined,
                    top: cutListRow.edgeBanding[2] > 0 ? { thickness: cutListRow.edgeBanding[2] } : undefined,
                    bottom: cutListRow.edgeBanding[3] > 0 ? { thickness: cutListRow.edgeBanding[3] } : undefined,
                },
            }
            : {};

        // Generate DXF even with warnings (but not errors)
        const dxfContent = operationGraphToDxf(panelGraph, {
            ...dxfOptions,
            includeOutline: true,
            panelWidth,
            panelHeight,
            ...edgeBandingOption,
        });

        // G10: Create provenance tracking
        const provenance = createOperationGraphProvenance(packet, panelGraph, panelId);

        // G10: Validate DXF safety
        const g10Result = assertDxfSafety(dxfContent, provenance);

        // G10: Get safe DXF — branded ONLY when G10 passes (ADR-065: no forged cast)
        const safeDxf = g10Result.ok ? g10Result.dxf : undefined;

        // Collect G10 warnings
        if (g10Result.ok && g10Result.warnings.length > 0) {
            for (const warn of g10Result.warnings) {
                warnings.push(`[G10] ${panelId}: ${warn.message}`);
            }
        }

        const filename = `${panelName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${machineId}.dxf`;

        panels.push({
            panelId,
            panelName,
            filename,
            content: dxfContent,
            safeDxf,
            operationCount: panelOperations.length,
            validation,
            provenance,
            g10Result,
            semanticResult,
            dialectResult,
        });

        totalOperations += panelOperations.length;

        // Progress callback
        if (onPanelProgress) {
            onPanelProgress(panelId, panelName, i + 1, targetPanelIds.length);
        }
    }

    // Calculate G10 overall status (includes G10.1, G10.2, and G10.3)
    const g10Status = {
        allPassed: panels.every(p => p.g10Result.ok && !p.semanticResult.blocked && p.dialectResult.ok),
        passedCount: panels.filter(p => p.g10Result.ok && !p.semanticResult.blocked && p.dialectResult.ok).length,
        totalCount: panels.length,
    };

    return {
        ok: true,
        panels,
        totalOperations,
        machineId,
        warnings,
        g10Status,
    };
}

// ============================================
// ZIP BUILD + DOWNLOAD
// ============================================

export interface DxfZipResult {
    /** ZIP file bytes */
    zipBytes: Uint8Array;
    /** Suggested filename (NFP- prefixed while SHADOW_MODE is on) */
    filename: string;
}

/**
 * Build the DXF ZIP archive — HARD GATE on G10.
 *
 * ADR-065: the ZIP is refused (throws) when ANY panel fails G10/G10.2/G10.3.
 * Only G10-branded SafeDxf content enters the archive; there is no raw-content
 * fallback. While SHADOW_MODE is on, the archive carries NOT_FOR_PRODUCTION.txt
 * and the filename is prefixed NFP-.
 *
 * @param packet - Verified FactoryPacket
 * @param options - Export options
 * @returns ZIP bytes and suggested filename
 * @throws Error when export fails or any panel fails G10
 */
export async function buildDxfZipFromPacket(
    packet: FactoryPacket,
    options: DxfExportOptions = {}
): Promise<DxfZipResult> {
    const result = await exportDxfFromPacket(packet, options);

    if (!result.ok) {
        throw new Error(result.error);
    }

    // ADR-065 HARD GATE: no ZIP leaves the system when G10 fails
    if (!result.g10Status.allPassed) {
        const failedPanels = result.panels
            .filter(p => !p.g10Result.ok || p.semanticResult.blocked || !p.dialectResult.ok)
            .map(p => {
                const reasons: string[] = [];
                if (!p.g10Result.ok) {
                    reasons.push(`G10: ${p.g10Result.issues.map(i => i.message).join('; ')}`);
                }
                if (p.semanticResult.blocked) {
                    reasons.push(`G10.2: ${p.semanticResult.summary.blockCount} blocking issue(s)`);
                }
                if (!p.dialectResult.ok) {
                    reasons.push(`G10.3: ${p.dialectResult.summary.blockingIssues} blocking issue(s)`);
                }
                return `${p.panelId} [${reasons.join(' | ')}]`;
            });
        throw new Error(
            `DXF ZIP blocked — G10 FAIL on panel(s): ${failedPanels.join(', ')}. ` +
            'No DXF may reach the machine without a passing G10 gate (ADR-065).'
        );
    }

    // Create ZIP
    const zip = new JSZip();
    const folder = zip.folder('DXF');

    if (!folder) {
        throw new Error('Failed to create ZIP folder');
    }

    for (const panel of result.panels) {
        // safeDxf is guaranteed by the allPassed gate above; the explicit check
        // keeps the invariant fail-visible if the gate is ever weakened.
        if (!panel.safeDxf) {
            throw new Error(
                `DXF ZIP blocked — panel ${panel.panelId} has no G10-branded SafeDxf (ADR-065)`
            );
        }
        folder.file(panel.filename, panel.safeDxf);
    }

    // ADR-065 Q3: shadow-mode label inside the archive
    if (SHADOW_MODE_NOT_FOR_PRODUCTION) {
        zip.file(NOT_FOR_PRODUCTION_FILE, NOT_FOR_PRODUCTION_NOTICE);
    }

    // Add manifest with G10 verification status
    const manifest = {
        generatedAt: new Date().toISOString(),
        machineId: result.machineId,
        totalOperations: result.totalOperations,
        panels: result.panels.map(p => ({
            panelId: p.panelId,
            panelName: p.panelName,
            filename: p.filename,
            operationCount: p.operationCount,
            g10: {
                ok: p.g10Result.ok,
                source: p.provenance.source,
                packetId: p.provenance.packetId,
            },
            g10_2: {
                valid: p.semanticResult.valid,
                blocked: p.semanticResult.blocked,
                blockCount: p.semanticResult.summary.blockCount,
                warnCount: p.semanticResult.summary.warnCount,
            },
            g10_3: {
                ok: p.dialectResult.ok,
                blockCount: p.dialectResult.summary.blockingIssues,
                warnCount: p.dialectResult.summary.warningIssues,
            },
        })),
        warnings: result.warnings,
        source: 'OperationGraph (AGENT-T008)',
        gate10: {
            allPassed: result.panels.every(p => p.g10Result.ok && !p.semanticResult.blocked),
            verifiedCount: result.panels.filter(p => p.g10Result.ok && !p.semanticResult.blocked).length,
            totalCount: result.panels.length,
        },
        gate10_2: {
            allValid: result.panels.every(p => p.semanticResult.valid),
            noneBlocked: result.panels.every(p => !p.semanticResult.blocked),
            totalBlockIssues: result.panels.reduce((sum, p) => sum + p.semanticResult.summary.blockCount, 0),
            totalWarnIssues: result.panels.reduce((sum, p) => sum + p.semanticResult.summary.warnCount, 0),
        },
        gate10_3: {
            allPassed: result.panels.every(p => p.dialectResult.ok),
            passedCount: result.panels.filter(p => p.dialectResult.ok).length,
            totalBlockIssues: result.panels.reduce((sum, p) => sum + p.dialectResult.summary.blockingIssues, 0),
            totalWarnIssues: result.panels.reduce((sum, p) => sum + p.dialectResult.summary.warningIssues, 0),
        },
    };

    folder.file('_manifest.json', JSON.stringify(manifest, null, 2));

    // Generate ZIP bytes
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });

    // ADR-065 Q3: NFP- prefix in filename — visible before opening
    const nfpPrefix = SHADOW_MODE_NOT_FOR_PRODUCTION ? 'NFP-' : '';
    const filename = `${nfpPrefix}DXF_${result.machineId}_${Date.now()}.zip`;

    return { zipBytes, filename };
}

/**
 * Export DXF files as ZIP archive and trigger browser download.
 *
 * ADR-065: delegates to buildDxfZipFromPacket — download is refused (throws)
 * when any panel fails G10.
 *
 * @param packet - Verified FactoryPacket
 * @param options - Export options
 */
export async function downloadDxfZipFromPacket(
    packet: FactoryPacket,
    options: DxfExportOptions = {}
): Promise<void> {
    const { zipBytes, filename } = await buildDxfZipFromPacket(packet, options);

    // Create a fresh Uint8Array copy to satisfy BlobPart type requirements
    const blobPart = new Uint8Array(zipBytes);
    const blob = new Blob([blobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================
// INTEGRATION HELPER
// ============================================

/**
 * Check if DXF export from OperationGraph is available
 *
 * @param packet - FactoryPacket to check
 * @returns Availability status
 */
export function canExportDxfFromOperationGraph(
    packet: FactoryPacket | null
): { available: boolean; reason?: string } {
    if (!packet) {
        return { available: false, reason: 'No packet available' };
    }

    if (!packet.drillMap) {
        return { available: false, reason: 'Packet has no drill map' };
    }

    if (packet.drillMap.panels.length === 0) {
        return { available: false, reason: 'Packet has no panels' };
    }

    return { available: true };
}
