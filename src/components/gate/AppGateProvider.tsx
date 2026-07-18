/**
 * AppGateProvider — S18 Slice 3
 *
 * Mount GateProvider แบบ autoRun ให้ Safety Gate วิ่งเองเมื่อ design เปลี่ยน
 * (cabinets / drillMap) — ผู้ใช้ไม่ต้องกด Run Gate เอง ปุ่ม Freeze จึงพูดความจริงเสมอ
 * (canFreeze ใน useSpecStore ผูกกับผล gate ผ่าน isFreezeAllowed — S18 Slice 1)
 *
 * ใช้ runGateValidation ตัวเดียวกับปุ่ม Run Gate ใน SafetyPanel
 * เพื่อให้ autoRun กับ manual run ให้ผลเหมือนกันเสมอ
 */

import { type ReactNode } from 'react';
import { GateProvider } from '../../gate/ui/GateProvider';
import { runGateValidation } from '../../gate/ui/SafetyPanel';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';

export interface AppGateProviderProps {
  children: ReactNode;
}

export function AppGateProvider({ children }: AppGateProviderProps) {
  const cabinets = useCabinetStore((s) => s.cabinets);
  const drillMap = useDrillMapStore((s) => s.drillMap);

  return (
    <GateProvider
      autoRun
      onRunGate={runGateValidation}
      dependencies={[cabinets, drillMap]}
      debounceMs={500}
    >
      {children}
    </GateProvider>
  );
}

export default AppGateProvider;
