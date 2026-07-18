/**
 * useRoleStore.ts - Reactive presentation-role store (S18 L7 Slice 2)
 *
 * Zustand mirror of the local presentation role so guards and the AppShell
 * role switcher re-render on change. Persists the RAW role string to the
 * legacy key 'monolith.user.role' via setCurrentRole(), so non-React readers
 * (getCurrentRole / hasRole in roles.ts) keep working unchanged.
 *
 * สิทธิ์แสดงผลฝั่งจอเท่านั้น — สิทธิ์จริงอยู่ที่ server (RLS/Edge) เสมอ
 */

import { create } from 'zustand';
import { type Role, getCurrentRole, setCurrentRole } from './roles';

interface RoleState {
  /** Current presentation role (mirrors 'monolith.user.role') */
  role: Role;
}

interface RoleActions {
  /** Switch presentation role; persists raw string for getCurrentRole() */
  setRole: (role: Role) => void;
}

type RoleStore = RoleState & RoleActions;

export const useRoleStore = create<RoleStore>()((set) => ({
  role: getCurrentRole(),

  setRole: (role) => {
    setCurrentRole(role); // raw string, same key — shared with roles.ts
    set({ role });
  },
}));
