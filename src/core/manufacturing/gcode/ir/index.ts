// src/core/manufacturing/gcode/ir/index.ts
/**
 * G-code IR Module.
 *
 * Canonical intermediate representation for G-code.
 */

export type {
  IRUnit,
  IRPlane,
  IRSetUnits,
  IRSetAbs,
  IRSetPlane,
  IRSpindleOn,
  IRSpindleOff,
  IRToolChange,
  IRSetFeed,
  IRRapid,
  IRLinear,
  IRArcCW,
  IRArcCCW,
  IRDwell,
  IRComment,
  IRProgramEnd,
  IRCoolantOn,
  IRCoolantOff,
  IRMove,
  IRProgramAudit,
  IRProgramMeta,
  IRProgram,
} from "./gcodeIr.v1";

export {
  irComment,
  irRapid,
  irLinear,
  irArcCW,
  irArcCCW,
  irToolChange,
  irSpindleOn,
  irSpindleOff,
  irSetFeed,
  irDwell,
  irProgramEnd,
  irStandardHeader,
  countMovesByKind,
  extractToolChanges,
  getToolSequence,
} from "./gcodeIr.v1";
