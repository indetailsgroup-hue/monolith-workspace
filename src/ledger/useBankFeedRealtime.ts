/**
 * useBankFeedRealtime — WebSocket subscription for live Bank Feed updates
 *
 * Subscribes to Supabase Realtime channel on `bank_feed_txn` table.
 * Automatically reconnects on disconnect. Provides loading/error states.
 *
 * Architecture:
 * - Uses Supabase JS client's Realtime Channels (postgres_changes)
 * - Listens for INSERT/UPDATE on public.bank_feed_txn
 * - Merges new transactions into local state (idempotent by bank_txn_id)
 * - Falls back to polling if WebSocket unavailable
 *
 * @version 14.1.0
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { readFieldSession } from '../bridge/fieldBridge';
import type { BankTxn, LedgerRecord, MatchResult } from './bankfeed';
import { autoMatch } from './bankfeed';

// ============================================================================
// Types
// ============================================================================

export interface RealtimeBankTxn extends BankTxn {
  /** Match status from server (pre-computed) */
  matchStatus: 'matched' | 'pending';
  /** If matched, which journal entry */
  matchedEntryId?: string;
  /** When imported */
  importedAt: string;
}

export interface UseBankFeedRealtimeOptions {
  /** Enable/disable subscription. Default: true */
  enabled?: boolean;
  /** Polling interval in ms if WS unavailable. Default: 30000 (30s) */
  pollInterval?: number;
  /** Initial data to seed (e.g. from SSR or test) */
  initialData?: RealtimeBankTxn[];
}

export interface UseBankFeedRealtimeResult {
  /** Current list of bank transactions (live-updated) */
  transactions: RealtimeBankTxn[];
  /** Connection state */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Last error message */
  error: string;
  /** Number of new txns since last clear */
  newCount: number;
  /** Clear new count (user acknowledged) */
  clearNew: () => void;
  /** Force reconnect */
  reconnect: () => void;
  /** Last update timestamp */
  lastUpdate: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL as string) ?? '';
const SUPABASE_ANON = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY as string) ?? '';

const REALTIME_CHANNEL = 'bank-feed-live';
const RECONNECT_DELAY = 3000; // 3 seconds

// ============================================================================
// Helpers
// ============================================================================

/** Transform Supabase row payload to RealtimeBankTxn */
function rowToTxn(row: Record<string, unknown>): RealtimeBankTxn {
  return {
    bankTxnId: String(row.bank_txn_id ?? row.id ?? ''),
    date: String(row.date ?? ''),
    amount: Number(row.amount ?? 0),
    description: String(row.description ?? ''),
    matchStatus: row.match_status === 'matched' ? 'matched' : 'pending',
    matchedEntryId: row.matched_entry_id ? String(row.matched_entry_id) : undefined,
    importedAt: String(row.imported_at ?? new Date().toISOString()),
  };
}

/** Merge new txn into existing list (idempotent by bankTxnId) */
function mergeTxn(existing: RealtimeBankTxn[], incoming: RealtimeBankTxn): RealtimeBankTxn[] {
  const idx = existing.findIndex((t) => t.bankTxnId === incoming.bankTxnId);
  if (idx >= 0) {
    // Update existing
    const updated = [...existing];
    updated[idx] = incoming;
    return updated;
  }
  // Append new
  return [...existing, incoming];
}

// ============================================================================
// HTTP Fetch (fallback polling)
// ============================================================================

async function fetchBankFeedHttp(): Promise<RealtimeBankTxn[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return [];
  const session = readFieldSession();
  if (!session) return [];

  const res = await fetch(`${SUPABASE_URL}/rest/v1/bank_feed_txn?order=date.desc&limit=100`, {
    headers: {
      apikey: SUPABASE_ANON,
      authorization: `Bearer ${session.accessToken}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) return [];
  const rows: Record<string, unknown>[] = await res.json();
  return rows.map(rowToTxn);
}

// ============================================================================
// WebSocket Connection Manager
// ============================================================================

interface WsConnection {
  ws: WebSocket | null;
  subscriptionId: string;
  destroy: () => void;
}

function createRealtimeConnection(
  onMessage: (txn: RealtimeBankTxn) => void,
  onStatus: (status: UseBankFeedRealtimeResult['status']) => void,
  onError: (msg: string) => void,
): WsConnection {
  const session = readFieldSession();
  if (!SUPABASE_URL || !SUPABASE_ANON || !session) {
    onStatus('error');
    onError('ยังไม่มี session — เปิด Field App แล้วล็อกอินก่อน');
    return { ws: null, subscriptionId: '', destroy: () => {} };
  }

  // Construct Supabase Realtime WebSocket URL
  const wsUrl = SUPABASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
  const realtimeUrl = `${wsUrl}/realtime/v1/websocket?apikey=${SUPABASE_ANON}&vsn=1.0.0`;

  onStatus('connecting');

  let ws: WebSocket;
  try {
    ws = new WebSocket(realtimeUrl);
  } catch (e) {
    onStatus('error');
    onError(`WebSocket creation failed: ${e instanceof Error ? e.message : String(e)}`);
    return { ws: null, subscriptionId: '', destroy: () => {} };
  }

  const subscriptionId = `realtime:public:bank_feed_txn:${Date.now()}`;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  ws.onopen = () => {
    // Join the channel
    const joinMsg = {
      topic: `realtime:public:bank_feed_txn`,
      event: 'phx_join',
      payload: {
        config: {
          postgres_changes: [
            {
              event: '*', // INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'bank_feed_txn',
            },
          ],
        },
      },
      ref: '1',
    };
    ws.send(JSON.stringify(joinMsg));

    // Start heartbeat every 30s
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: String(Date.now()),
        }));
      }
    }, 30000);

    onStatus('connected');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      // Handle postgres_changes events
      if (msg.event === 'postgres_changes' || msg.event === 'INSERT' || msg.event === 'UPDATE') {
        const payload = msg.payload;
        if (payload?.record || payload?.new) {
          const row = payload.record ?? payload.new;
          const txn = rowToTxn(row);
          onMessage(txn);
        }
      }
      // Handle system events
      if (msg.event === 'phx_reply' && msg.payload?.status === 'ok') {
        onStatus('connected');
      }
    } catch {
      // Ignore parse errors on non-JSON messages
    }
  };

  ws.onerror = () => {
    onStatus('error');
    onError('WebSocket connection error');
  };

  ws.onclose = () => {
    onStatus('disconnected');
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  };

  const destroy = () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, 'unsubscribe');
    }
  };

  return { ws, subscriptionId, destroy };
}

// ============================================================================
// Hook: useBankFeedRealtime
// ============================================================================

export function useBankFeedRealtime(
  options: UseBankFeedRealtimeOptions = {},
): UseBankFeedRealtimeResult {
  const { enabled = true, pollInterval = 30000, initialData = [] } = options;

  const [transactions, setTransactions] = useState<RealtimeBankTxn[]>(initialData);
  const [status, setStatus] = useState<UseBankFeedRealtimeResult['status']>('disconnected');
  const [error, setError] = useState('');
  const [newCount, setNewCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  const connectionRef = useRef<WsConnection | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleMessage = useCallback((txn: RealtimeBankTxn) => {
    setTransactions((prev) => mergeTxn(prev, txn));
    setNewCount((c) => c + 1);
    setLastUpdate(new Date().toISOString());
  }, []);

  const connect = useCallback(() => {
    // Clean up existing
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }

    const conn = createRealtimeConnection(handleMessage, setStatus, setError);
    connectionRef.current = conn;

    // If WS failed immediately, fall back to polling
    if (!conn.ws) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const data = await fetchBankFeedHttp();
        if (data.length > 0) {
          setTransactions(data);
          setLastUpdate(new Date().toISOString());
        }
      }, pollInterval);
    }
  }, [handleMessage, pollInterval]);

  const reconnect = useCallback(() => {
    setError('');
    connect();
  }, [connect]);

  const clearNew = useCallback(() => {
    setNewCount(0);
  }, []);

  // Initial fetch + WS connection
  useEffect(() => {
    if (!enabled) return;

    // Fetch initial data
    fetchBankFeedHttp().then((data) => {
      if (data.length > 0) {
        setTransactions(data);
        setLastUpdate(new Date().toISOString());
      }
    });

    // Establish WS connection
    connect();

    return () => {
      if (connectionRef.current) {
        connectionRef.current.destroy();
        connectionRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [enabled, connect]);

  // Auto-reconnect on disconnect
  useEffect(() => {
    if (status === 'disconnected' && enabled) {
      const timer = setTimeout(reconnect, RECONNECT_DELAY);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status, enabled, reconnect]);

  return {
    transactions,
    status,
    error,
    newCount,
    clearNew,
    reconnect,
    lastUpdate,
  };
}

export default useBankFeedRealtime;
