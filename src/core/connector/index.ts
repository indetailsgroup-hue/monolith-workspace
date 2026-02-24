/**
 * Connector OS v1.1 - Digital Joinery Compiler
 *
 * Brand-agnostic connector compilation pipeline for CNC manufacturing.
 *
 * Pipeline: Selection → Placer → Synthesis → Emission (OPGRAPH)
 *
 * @see docs/connector-os/README.md
 */

export * from './types';
export { calculateCncCoordinate, targetJ10Transform } from './calculateCncCoordinate';
export * from './catalog';
export { getConnectorPositions } from './placer';
export { compileConnectorOps } from './compiler';
export { validateG11Mode, validateG11Pairing, validateG11Spacing } from './gateG11Mode';
export type { G11ModeResult, G11ModeIssue } from './gateG11Mode';
export { emitToOpNodes } from './emitToOpGraph';
