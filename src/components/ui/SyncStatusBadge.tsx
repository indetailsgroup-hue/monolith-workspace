/**
 * SyncStatusBadge - P11 Server Sync Status Indicator
 *
 * Shows connection status to P10 server:
 * - synced: Green - Connected and up to date
 * - pending: Yellow - Syncing in progress
 * - error: Red - Server error
 * - offline: Gray - Working offline
 */

import { Cloud, CloudOff, Loader2, AlertCircle, Check, Clock } from 'lucide-react';
import { useSyncStatus, useServerRevisionId, usePendingTransition } from '../../core/store/useSpecStore';
import type { SyncStatus } from '../../core/api/stateApi';

interface SyncStatusBadgeProps {
  compact?: boolean;
  showRevision?: boolean;
  showPending?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<SyncStatus, {
  icon: React.ReactNode;
  label: string;
  labelTH: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  synced: {
    icon: <Check size={12} />,
    label: 'Synced',
    labelTH: 'ซิงค์แล้ว',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  pending: {
    icon: <Loader2 size={12} className="animate-spin" />,
    label: 'Syncing',
    labelTH: 'กำลังซิงค์',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  error: {
    icon: <AlertCircle size={12} />,
    label: 'Sync Error',
    labelTH: 'ซิงค์ผิดพลาด',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  offline: {
    icon: <CloudOff size={12} />,
    label: 'Offline',
    labelTH: 'ออฟไลน์',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/30',
  },
};

export function SyncStatusBadge({
  compact = false,
  showRevision = false,
  showPending = false,
  className = '',
}: SyncStatusBadgeProps) {
  const syncStatus = useSyncStatus();
  const serverRevisionId = useServerRevisionId();
  const pendingTransition = usePendingTransition();

  const config = STATUS_CONFIG[syncStatus];

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1 ${config.color} ${className}`}
        title={`${config.label} - ${config.labelTH}${pendingTransition ? ` | Pending: ${pendingTransition.type}` : ''}`}
      >
        {config.icon}
        {showPending && pendingTransition && (
          <Clock size={10} className="text-purple-400" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border
        ${config.bgColor} ${config.borderColor} ${config.color}
        ${className}`}
    >
      <Cloud size={14} className="opacity-60" />
      {config.icon}
      <span className="text-xs font-medium">{config.labelTH}</span>
      {showRevision && serverRevisionId && syncStatus === 'synced' && (
        <span className="text-[10px] font-mono opacity-60 ml-1">
          {serverRevisionId.slice(0, 8)}
        </span>
      )}
      {/* P11.1: Pending transition indicator */}
      {showPending && pendingTransition && (
        <span
          className="flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-400 text-[10px]"
          title={`Queued: ${pendingTransition.type} — will retry when online`}
        >
          <Clock size={10} />
          {pendingTransition.type}
        </span>
      )}
    </div>
  );
}

export default SyncStatusBadge;
