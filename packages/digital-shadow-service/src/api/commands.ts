/**
 * MONOLITH Digital Shadow — Phase 2 Command API Routes
 * Hono routes for bi-directional machine control
 * 
 * Endpoints:
 *   POST   /commands                 — Submit a command
 *   GET    /commands/:commandId      — Get command status
 *   DELETE /commands/:commandId      — Cancel a pending command
 *   GET    /commands/machine/:id     — Get queue for a machine
 *   POST   /commands/emergency-stop  — Emergency stop (shortcut)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  CommandType,
  CommandPriority,
  CommandStatus,
} from '../types/command';
import type { CommandRequest, CommandInitiator } from '../types/command';
import type { CommandDispatcher } from '../services/CommandDispatcher';

// ─── Request Validation Schemas ──────────────────────────────────────────────

const startJobSchema = z.object({
  type: z.literal('START_JOB'),
  jobId: z.string().min(1),
  programRef: z.string().min(1),
  material: z.object({
    type: z.string(),
    thickness: z.number().positive(),
  }).optional(),
  expectedCycleTime: z.number().positive().optional(),
});

const pauseJobSchema = z.object({
  type: z.literal('PAUSE_JOB'),
  reason: z.enum(['operator_request', 'tool_change', 'material_shortage', 'quality_hold']),
});

const resumeJobSchema = z.object({
  type: z.literal('RESUME_JOB'),
  resumeConfirmation: z.string().optional(),
});

const abortJobSchema = z.object({
  type: z.literal('ABORT_JOB'),
  reason: z.string().min(1),
  graceful: z.boolean(),
});

const payloadSchema = z.discriminatedUnion('type', [
  startJobSchema,
  pauseJobSchema,
  resumeJobSchema,
  abortJobSchema,
]);

const commandRequestSchema = z.object({
  machineId: z.string().min(1),
  commandType: z.nativeEnum(CommandType),
  priority: z.nativeEnum(CommandPriority).default(CommandPriority.NORMAL),
  payload: payloadSchema,
  initiator: z.object({
    source: z.enum(['factory_server', 'operator_panel', 'scheduler', 'safety_system']),
    actorId: z.string().min(1),
    traceId: z.string().optional(),
  }),
  timeoutMs: z.number().positive().default(30_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const emergencyStopSchema = z.object({
  machineId: z.string().min(1),
  source: z.enum(['operator', 'sensor', 'safety_system']).default('operator'),
  actorId: z.string().min(1),
});

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createCommandRoutes(dispatcher: CommandDispatcher): Hono {
  const app = new Hono();

  // ─── POST /commands — Submit a new command ─────────────────────────────────

  app.post('/commands', async (c) => {
    const body = await c.req.json();
    const validation = commandRequestSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid command request',
          details: validation.error.format(),
        },
        400,
      );
    }

    const data = validation.data;

    const request: CommandRequest = {
      requestId: randomUUID(),
      machineId: data.machineId,
      commandType: data.commandType,
      priority: data.priority,
      payload: data.payload as CommandRequest['payload'],
      initiator: data.initiator as CommandInitiator,
      timeoutMs: data.timeoutMs,
      metadata: data.metadata,
    };

    try {
      const response = await dispatcher.submitCommand(request);

      const httpStatus = response.status === CommandStatus.REJECTED ? 422 : 202;
      return c.json(response, httpStatus);
    } catch (err) {
      return c.json(
        {
          error: 'INTERNAL_ERROR',
          message: (err as Error).message,
        },
        500,
      );
    }
  });

  // ─── GET /commands/:commandId — Get command status ─────────────────────────

  app.get('/commands/:commandId', async (c) => {
    const commandId = c.req.param('commandId');
    const response = await dispatcher.getCommandStatus(commandId);

    if (!response) {
      return c.json(
        { error: 'NOT_FOUND', message: `Command ${commandId} not found` },
        404,
      );
    }

    return c.json(response);
  });

  // ─── DELETE /commands/:commandId — Cancel a pending command ─────────────────

  app.delete('/commands/:commandId', async (c) => {
    const commandId = c.req.param('commandId');
    const cancelled = await dispatcher.cancelCommand(commandId);

    if (!cancelled) {
      return c.json(
        {
          error: 'CANCEL_FAILED',
          message: `Cannot cancel command ${commandId} — not in QUEUED state or not found`,
        },
        409,
      );
    }

    return c.json({ commandId, status: 'CANCELLED' });
  });

  // ─── GET /commands/machine/:machineId — Get queue for machine ──────────────

  app.get('/commands/machine/:machineId', async (c) => {
    const machineId = c.req.param('machineId');
    return c.json({ machineId, message: 'Use /commands/:commandId for individual status' });
  });

  // ─── POST /commands/emergency-stop — Quick emergency stop ──────────────────

  app.post('/commands/emergency-stop', async (c) => {
    const body = await c.req.json();
    const validation = emergencyStopSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid emergency stop request',
          details: validation.error.format(),
        },
        400,
      );
    }

    const data = validation.data;

    const request: CommandRequest = {
      requestId: randomUUID(),
      machineId: data.machineId,
      commandType: CommandType.EMERGENCY_STOP,
      priority: CommandPriority.CRITICAL,
      payload: {
        type: CommandType.EMERGENCY_STOP,
        source: data.source,
      },
      initiator: {
        source: 'operator_panel',
        actorId: data.actorId,
      },
      timeoutMs: 2000,
    };

    const response = await dispatcher.submitCommand(request);

    // Emergency always returns 200 (processed) or 500 (failed)
    const httpStatus = response.status === CommandStatus.COMPLETED ? 200 : 500;
    return c.json(response, httpStatus);
  });

  return app;
}
