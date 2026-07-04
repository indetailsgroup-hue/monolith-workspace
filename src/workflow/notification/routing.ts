// Feature: monolith-workflow-copilot — direct vs group routing (Req 6.1, 6.2)
import type { NotificationChannel } from '../domain/types';

export type NotificationIntent =
  | 'personal_responsibility' // งานที่ต้องรับผิดชอบ/อนุมัติส่วนตัว
  | 'personal_approval'
  | 'cross_team_handoff' // ส่งต่อข้ามทีม
  | 'fyi'; // เพื่อทราบ

/**
 * Req 6.1/6.2 — จัดเส้นทาง:
 *   ความรับผิดชอบ/อนุมัติส่วนตัว → direct_push
 *   handoff ข้ามทีม / FYI        → group_message
 */
export function routeNotification(intent: NotificationIntent): NotificationChannel {
  switch (intent) {
    case 'personal_responsibility':
    case 'personal_approval':
      return 'direct_push';
    case 'cross_team_handoff':
    case 'fyi':
      return 'group_message';
  }
}
