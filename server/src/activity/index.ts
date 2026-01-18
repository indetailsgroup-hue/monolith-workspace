/**
 * Activity Module - P8 Server-Authoritative Audit Trail
 *
 * @version 0.12.8
 */

export { activityRoute } from "./activityRoute.js";
export { appendActivity, readActivity, extractActorFromHeaders } from "./activityStorage.js";
export type { ActivityRecord, ActivityRecordPartial, ActivityType, ActorRole } from "./activityTypes.js";
