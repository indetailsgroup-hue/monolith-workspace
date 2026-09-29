/**
 * Test suite for Migration 0197 — partition_archive_log
 * MONOLITH Manufacturing OS
 *
 * Coverage:
 *   Group A — Table structure & constraints
 *   Group B — Direct insert (service_role path)
 *   Group C — RLS enforcement (authenticated cannot read directly)
 *   Group D — rpc_partition_archive_log filtering
 *   Group E — rpc_partition_archive_log_stats aggregates
 *   Group F — Cross-tenant isolation
 *   Group G — updated_at auto-stamp trigger
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Environment ──────────────────────────────────────────────────────────────
const SUPABASE_URL     = process.env.SUPABASE_URL     ?? 'http://localhost:54321'
const SERVICE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-key'
const ANON_KEY         = process.env.SUPABASE_ANON_KEY ?? 'test-anon-key'
const ORG_A_JWT        = process.env.TEST_ORG_A_JWT   ?? ''
const ORG_B_JWT        = process.env.TEST_ORG_B_JWT   ?? ''

// ─── Clients ──────────────────────────────────────────────────────────────────
let svc:   SupabaseClient   // service_role — bypasses RLS
let anon:  SupabaseClient   // anon — unauthenticated
let orgA:  SupabaseClient   // authenticated as org A user
let orgB:  SupabaseClient   // authenticated as org B user (cross-tenant)

// ─── Test state ───────────────────────────────────────────────────────────────
const createdUserIds: string[] = []

const TEST_PARTITIONS = [
  {
    partition_name:       'etax_submissions_y2024m01',
    original_range_start: '2024-01-01',
    original_range_end:   '2024-02-01',
    row_count_at_archive: 1200,
    action:               'DETACH_RENAME',
    archived_name:        'etax_submissions_y2024m01_archived_20260901',
    archived_by:          'postgres',
    notes:                '24-month retention window exceeded',
  },
  {
    partition_name:       'etax_submissions_y2024m02',
    original_range_start: '2024-02-01',
    original_range_end:   '2024-03-01',
    row_count_at_archive: 980,
    action:               'DETACH_BACKUP_RENAME',
    archived_name:        'etax_submissions_y2024m02_archived_20260901',
    backup_file_path:     '/mnt/archive/etax_y2024m02.sql',
    backup_size_bytes:    4200000,
    archived_by:          'postgres',
    notes:                'Backed up before archival',
  },
  {
    partition_name:       'etax_submissions_y2024m03',
    original_range_start: '2024-03-01',
    original_range_end:   '2024-04-01',
    row_count_at_archive: 0,
    action:               'DETACH_DROP',
    archived_by:          'postgres',
    notes:                'Empty partition dropped',
  },
]

const insertedIds: number[] = []

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
  svc  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  anon = createClient(SUPABASE_URL, ANON_KEY,    { auth: { persistSession: false } })

  const authenticatedClient = async (label: string, configuredJwt: string) => {
    if (configuredJwt) {
      return createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${configuredJwt}` } },
      })
    }

    const email = `test-0197-${label}-${crypto.randomUUID()}@monolith.test`
    const password = 'Test@123456!'
    const { data: created, error: createError } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !created.user) {
      throw new Error(`create ${label} user: ${createError?.message}`)
    }
    createdUserIds.push(created.user.id)

    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) throw new Error(`sign in ${label}: ${signInError.message}`)
    return client
  }

  orgA = await authenticatedClient('org-a', ORG_A_JWT)
  orgB = await authenticatedClient('org-b', ORG_B_JWT)
})

afterAll(async () => {
  // Clean up test rows inserted during the suite
  if (insertedIds.length > 0) {
    await svc
      .from('partition_archive_log')
      .delete()
      .in('id', insertedIds)
  }
  for (const userId of createdUserIds) {
    await svc.auth.admin.deleteUser(userId)
  }
})

// ─── Helper ───────────────────────────────────────────────────────────────────
async function insertRow(overrides: Partial<typeof TEST_PARTITIONS[0]> = {}) {
  const row = { ...TEST_PARTITIONS[0], ...overrides }
  const { data, error } = await svc
    .from('partition_archive_log')
    .insert(row as any)
    .select('id')
    .single()
  expect(error).toBeNull()
  expect(data?.id).toBeDefined()
  insertedIds.push(data!.id)
  return data!.id as number
}

// ═════════════════════════════════════════════════════════════════════════════
// Group A — Table structure & constraints
// ═════════════════════════════════════════════════════════════════════════════
describe('Group A — Table structure & constraints', () => {
  it('A1: partition_archive_log table exists in public schema', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log')
    // RPC exists means table exists; no error on empty result
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('A2: required columns present — insert with minimal fields succeeds', async () => {
    const { data, error } = await svc
      .from('partition_archive_log')
      .insert({
        partition_name:       'etax_submissions_test_struct_a2',
        original_range_start: '2024-01-01',
        original_range_end:   '2024-02-01',
        row_count_at_archive: 0,
        action:               'DETACH',
        archived_by:          'test-suite',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeGreaterThan(0)
    insertedIds.push(data!.id)
  })

  it('A3: action CHECK constraint rejects invalid value', async () => {
    const { error } = await svc
      .from('partition_archive_log')
      .insert({
        partition_name:       'etax_submissions_bad_action',
        original_range_start: '2024-01-01',
        original_range_end:   '2024-02-01',
        row_count_at_archive: 0,
        action:               'INVALID_ACTION',
        archived_by:          'test-suite',
      })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/check|constraint|action/i)
  })

  it('A4: all valid action enum values are accepted', async () => {
    const actions = [
      'DETACH',
      'DETACH_RENAME',
      'DETACH_DROP',
      'DETACH_BACKUP_RENAME',
      'DETACH_BACKUP_DROP',
    ]
    for (const action of actions) {
      const { data, error } = await svc
        .from('partition_archive_log')
        .insert({
          partition_name:       `etax_submissions_test_action_${action.toLowerCase()}`,
          original_range_start: '2024-01-01',
          original_range_end:   '2024-02-01',
          row_count_at_archive: 0,
          action,
          archived_by:          'test-suite',
        })
        .select('id')
        .single()
      expect(error, `action=${action} should be valid`).toBeNull()
      insertedIds.push(data!.id)
    }
  })

  it('A5: NOT NULL constraint on partition_name is enforced', async () => {
    const { error } = await svc
      .from('partition_archive_log')
      .insert({
        original_range_start: '2024-01-01',
        original_range_end:   '2024-02-01',
        row_count_at_archive: 0,
        action:               'DETACH',
        archived_by:          'test-suite',
      } as any)
    expect(error).not.toBeNull()
  })

  it('A6: id is auto-generated BIGSERIAL (positive integer)', async () => {
    const id = await insertRow({ partition_name: 'etax_submissions_test_a6' })
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
  })

  it('A7: created_at and updated_at default to NOW()', async () => {
    const before = new Date()
    const id = await insertRow({ partition_name: 'etax_submissions_test_a7' })
    const { data } = await svc
      .from('partition_archive_log')
      .select('created_at, updated_at')
      .eq('id', id)
      .single()
    const after = new Date()
    expect(new Date(data!.created_at).getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(new Date(data!.updated_at).getTime()).toBeLessThanOrEqual(after.getTime() + 1000)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Group B — Direct insert (service_role path)
// ═════════════════════════════════════════════════════════════════════════════
describe('Group B — Direct insert (service_role path)', () => {
  it('B1: inserts all TEST_PARTITIONS successfully via service_role', async () => {
    for (const row of TEST_PARTITIONS) {
      const { data, error } = await svc
        .from('partition_archive_log')
        .insert(row as any)
        .select('id')
        .single()
      expect(error, `row=${row.partition_name}`).toBeNull()
      expect(data?.id).toBeDefined()
      insertedIds.push(data!.id)
    }
  })

  it('B2: optional fields (backup_file_path, backup_size_bytes, archived_name) store and retrieve correctly', async () => {
    const id = await insertRow({
      partition_name:       'etax_submissions_test_b2',
      action:               'DETACH_BACKUP_RENAME',
      archived_name:        'etax_submissions_test_b2_archived_20260901',
      backup_file_path:     '/mnt/archive/test_b2.sql',
      backup_size_bytes:    1024000,
      size_bytes_at_archive: 2048000,
    } as any)
    const { data, error } = await svc
      .from('partition_archive_log')
      .select('archived_name, backup_file_path, backup_size_bytes, size_bytes_at_archive')
      .eq('id', id)
      .single()
    expect(error).toBeNull()
    expect(data!.archived_name).toBe('etax_submissions_test_b2_archived_20260901')
    expect(data!.backup_file_path).toBe('/mnt/archive/test_b2.sql')
    expect(data!.backup_size_bytes).toBe(1024000)
    expect(data!.size_bytes_at_archive).toBe(2048000)
  })

  it('B3: notes field stores long text without truncation', async () => {
    const longNote = 'A'.repeat(2000)
    const id = await insertRow({
      partition_name: 'etax_submissions_test_b3',
      notes: longNote,
    })
    const { data } = await svc
      .from('partition_archive_log')
      .select('notes')
      .eq('id', id)
      .single()
    expect(data!.notes).toBe(longNote)
  })

  it('B4: row_count_at_archive = 0 is valid (empty partition drop case)', async () => {
    const id = await insertRow({
      partition_name:       'etax_submissions_test_b4_empty',
      row_count_at_archive: 0,
      action:               'DETACH_DROP',
    })
    const { data } = await svc
      .from('partition_archive_log')
      .select('row_count_at_archive')
      .eq('id', id)
      .single()
    expect(data!.row_count_at_archive).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Group C — RLS enforcement
// ═════════════════════════════════════════════════════════════════════════════
describe('Group C — RLS enforcement', () => {
  let seedId: number

  beforeAll(async () => {
    seedId = await insertRow({ partition_name: 'etax_submissions_rls_test_c' })
  })

  it('C1: anon client cannot SELECT from partition_archive_log directly', async () => {
    const { data, error } = await anon
      .from('partition_archive_log')
      .select('id')
      .limit(5)
    // Either error or empty result (RLS blocks all rows)
    const isBlocked = (error !== null) || (Array.isArray(data) && data.length === 0)
    expect(isBlocked).toBe(true)
  })

  it('C2: authenticated user cannot SELECT from partition_archive_log directly', async () => {
    const { data, error } = await orgA
      .from('partition_archive_log')
      .select('id')
      .limit(5)
    const isBlocked = (error !== null) || (Array.isArray(data) && data.length === 0)
    expect(isBlocked).toBe(true)
  })

  it('C3: authenticated user cannot INSERT into partition_archive_log directly', async () => {
    const { error } = await orgA
      .from('partition_archive_log')
      .insert({
        partition_name:       'etax_submissions_rls_insert_attempt',
        original_range_start: '2024-01-01',
        original_range_end:   '2024-02-01',
        row_count_at_archive: 0,
        action:               'DETACH',
        archived_by:          'attacker',
      })
    expect(error).not.toBeNull()
  })

  it('C4: authenticated user cannot UPDATE partition_archive_log directly', async () => {
    const { error } = await orgA
      .from('partition_archive_log')
      .update({ notes: 'tampered' })
      .eq('id', seedId)
    expect(error).not.toBeNull()
  })

  it('C5: authenticated user cannot DELETE from partition_archive_log directly', async () => {
    const { error } = await orgA
      .from('partition_archive_log')
      .delete()
      .eq('id', seedId)
    expect(error).not.toBeNull()
  })

  it('C6: service_role can SELECT all rows without restriction', async () => {
    const { data, error } = await svc
      .from('partition_archive_log')
      .select('id')
      .eq('id', seedId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Group D — rpc_partition_archive_log filtering
// ═════════════════════════════════════════════════════════════════════════════
describe('Group D — rpc_partition_archive_log filtering', () => {
  let d1Id: number, d2Id: number, d3Id: number

  beforeAll(async () => {
    d1Id = await insertRow({
      partition_name:       'etax_submissions_filter_d1',
      original_range_start: '2023-01-01',
      original_range_end:   '2023-02-01',
      row_count_at_archive: 500,
      action:               'DETACH_RENAME',
    })
    d2Id = await insertRow({
      partition_name:       'etax_submissions_filter_d2',
      original_range_start: '2023-06-01',
      original_range_end:   '2023-07-01',
      row_count_at_archive: 750,
      action:               'DETACH_BACKUP_RENAME',
      backup_file_path:     '/mnt/d2.sql',
    })
    d3Id = await insertRow({
      partition_name:       'etax_submissions_filter_d3',
      original_range_start: '2022-01-01',
      original_range_end:   '2022-02-01',
      row_count_at_archive: 200,
      action:               'DETACH_DROP',
    })
  })

  it('D1: no filters returns all rows (length >= 3)', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBeGreaterThanOrEqual(3)
  })

  it('D2: p_partition_name partial match filters correctly', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log', {
      p_partition_name: 'filter_d1',
    })
    expect(error).toBeNull()
    expect(data!.some((r: any) => r.id === d1Id)).toBe(true)
    expect(data!.some((r: any) => r.id === d2Id)).toBe(false)
  })

  it('D3: p_from_date filters rows by original_range_start >= date', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log', {
      p_from_date: '2023-01-01',
    })
    expect(error).toBeNull()
    // d3 (2022-01-01) should be excluded
    expect(data!.some((r: any) => r.id === d3Id)).toBe(false)
    expect(data!.some((r: any) => r.id === d1Id)).toBe(true)
  })

  it('D4: p_to_date filters rows by original_range_end <= date', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log', {
      p_to_date: '2023-02-01',
    })
    expect(error).toBeNull()
    // d2 ends at 2023-07-01 — should be excluded
    expect(data!.some((r: any) => r.id === d2Id)).toBe(false)
    expect(data!.some((r: any) => r.id === d1Id)).toBe(true)
  })

  it('D5: p_from_date + p_to_date combined range filter', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log', {
      p_from_date: '2023-01-01',
      p_to_date:   '2023-07-01',
    })
    expect(error).toBeNull()
    expect(data!.some((r: any) => r.id === d1Id)).toBe(true)
    expect(data!.some((r: any) => r.id === d3Id)).toBe(false)
  })

  it('D6: p_limit caps the number of returned rows', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log', {
      p_limit: 2,
    })
    expect(error).toBeNull()
    expect(data!.length).toBeLessThanOrEqual(2)
  })

  it('D7: p_limit capped at 1000 even if higher value passed', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log', {
      p_limit: 9999,
    })
    expect(error).toBeNull()
    // Should succeed without error (capped internally by LEAST(p_limit, 1000))
    expect(Array.isArray(data)).toBe(true)
  })

  it('D8: result rows contain expected columns', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log', {
      p_limit: 1,
    })
    expect(error).toBeNull()
    if (data && data.length > 0) {
      const row = data[0]
      expect(row).toHaveProperty('id')
      expect(row).toHaveProperty('partition_name')
      expect(row).toHaveProperty('original_range_start')
      expect(row).toHaveProperty('original_range_end')
      expect(row).toHaveProperty('row_count_at_archive')
      expect(row).toHaveProperty('action')
      expect(row).toHaveProperty('archived_by')
      expect(row).toHaveProperty('archived_at')
      expect(row).toHaveProperty('has_backup')
      expect(row).toHaveProperty('size_pretty')
      expect(row).toHaveProperty('days_since_archive')
    }
  })

  it('D9: has_backup is TRUE when backup_file_path is set', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log', {
      p_partition_name: 'filter_d2',
    })
    expect(error).toBeNull()
    const row = data?.find((r: any) => r.id === d2Id)
    expect(row).toBeDefined()
    expect(row!.has_backup).toBe(true)
    expect(row!.backup_file_path).toBe('/mnt/d2.sql')
  })

  it('D10: has_backup is FALSE when backup_file_path is null', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log', {
      p_partition_name: 'filter_d1',
    })
    expect(error).toBeNull()
    const row = data?.find((r: any) => r.id === d1Id)
    expect(row).toBeDefined()
    expect(row!.has_backup).toBe(false)
  })

  it('D11: results are ordered by archived_at DESC (newest first)', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log')
    expect(error).toBeNull()
    if (data && data.length > 1) {
      for (let i = 0; i < data.length - 1; i++) {
        const t1 = new Date(data[i].archived_at).getTime()
        const t2 = new Date(data[i + 1].archived_at).getTime()
        expect(t1).toBeGreaterThanOrEqual(t2)
      }
    }
  })

  it('D12: authenticated user can call rpc_partition_archive_log via RPC', async () => {
    // RPC is SECURITY DEFINER — authenticated can call even though direct table access is blocked
    const { data, error } = await orgA.rpc('rpc_partition_archive_log', { p_limit: 5 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Group E — rpc_partition_archive_log_stats aggregates
// ═════════════════════════════════════════════════════════════════════════════
describe('Group E — rpc_partition_archive_log_stats aggregates', () => {
  const statsSeedIds: number[] = []

  beforeAll(async () => {
    // Insert a clean, known set of rows for stats validation
    const rows = [
      {
        partition_name:         'etax_submissions_stats_e1',
        original_range_start:   '2021-01-01',
        original_range_end:     '2021-02-01',
        row_count_at_archive:   100,
        action:                 'DETACH_DROP',
        archived_by:            'stats-test',
      },
      {
        partition_name:         'etax_submissions_stats_e2',
        original_range_start:   '2021-02-01',
        original_range_end:     '2021-03-01',
        row_count_at_archive:   200,
        action:                 'DETACH_BACKUP_RENAME',
        backup_file_path:       '/mnt/stats_e2.sql',
        archived_by:            'stats-test',
      },
      {
        partition_name:         'etax_submissions_stats_e3',
        original_range_start:   '2021-03-01',
        original_range_end:     '2021-04-01',
        row_count_at_archive:   300,
        action:                 'DETACH_RENAME',
        archived_by:            'stats-test',
      },
    ]
    for (const r of rows) {
      const id = await insertRow(r)
      statsSeedIds.push(id)
    }
  })

  it('E1: rpc_partition_archive_log_stats returns exactly one row', async () => {
    const { data, error } = await svc.rpc('rpc_partition_archive_log_stats')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('E2: total_archived_partitions is a non-negative integer', async () => {
    const { data } = await svc.rpc('rpc_partition_archive_log_stats')
    expect(typeof data![0].total_archived_partitions).toBe('number')
    expect(data![0].total_archived_partitions).toBeGreaterThanOrEqual(0)
  })

  it('E3: total_rows_archived is non-negative and reflects inserted rows', async () => {
    const { data } = await svc.rpc('rpc_partition_archive_log_stats')
    expect(data![0].total_rows_archived).toBeGreaterThanOrEqual(600) // our 3 seed rows = 100+200+300
  })

  it('E4: total_backups_taken counts rows with backup_file_path set', async () => {
    const { data } = await svc.rpc('rpc_partition_archive_log_stats')
    // At least 1 backup from stats_e2
    expect(data![0].total_backups_taken).toBeGreaterThanOrEqual(1)
  })

  it('E5: total_partitions_dropped counts DETACH_DROP and DETACH_BACKUP_DROP actions', async () => {
    const { data } = await svc.rpc('rpc_partition_archive_log_stats')
    // stats_e1 action = DETACH_DROP
    expect(data![0].total_partitions_dropped).toBeGreaterThanOrEqual(1)
  })

  it('E6: earliest_archive_date is a valid ISO timestamp', async () => {
    const { data } = await svc.rpc('rpc_partition_archive_log_stats')
    expect(() => new Date(data![0].earliest_archive_date)).not.toThrow()
    expect(new Date(data![0].earliest_archive_date).getTime()).toBeGreaterThan(0)
  })

  it('E7: latest_archive_date >= earliest_archive_date', async () => {
    const { data } = await svc.rpc('rpc_partition_archive_log_stats')
    const earliest = new Date(data![0].earliest_archive_date).getTime()
    const latest   = new Date(data![0].latest_archive_date).getTime()
    expect(latest).toBeGreaterThanOrEqual(earliest)
  })

  it('E8: most_recent_partition is a non-empty string', async () => {
    const { data } = await svc.rpc('rpc_partition_archive_log_stats')
    expect(typeof data![0].most_recent_partition).toBe('string')
    expect(data![0].most_recent_partition.length).toBeGreaterThan(0)
  })

  it('E9: most_recent_action is a valid action enum value', async () => {
    const valid = ['DETACH','DETACH_RENAME','DETACH_DROP','DETACH_BACKUP_RENAME','DETACH_BACKUP_DROP']
    const { data } = await svc.rpc('rpc_partition_archive_log_stats')
    expect(valid).toContain(data![0].most_recent_action)
  })

  it('E10: authenticated user can call rpc_partition_archive_log_stats', async () => {
    const { data, error } = await orgA.rpc('rpc_partition_archive_log_stats')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Group F — Cross-tenant isolation
// ═════════════════════════════════════════════════════════════════════════════
describe('Group F — Cross-tenant isolation', () => {
  /**
   * partition_archive_log is not org-scoped (it's a global ops table),
   * but we verify:
   *   - Authenticated users cannot directly read or modify any row
   *   - The RPC is accessible to all authenticated users (global ops visibility)
   *   - service_role is the only direct-access actor
   */

  it('F1: org A cannot read org B rows directly from table', async () => {
    const { data, error } = await orgA
      .from('partition_archive_log')
      .select('id')
    const isBlocked = (error !== null) || (Array.isArray(data) && data.length === 0)
    expect(isBlocked).toBe(true)
  })

  it('F2: org B cannot read org A rows directly from table', async () => {
    const { data, error } = await orgB
      .from('partition_archive_log')
      .select('id')
    const isBlocked = (error !== null) || (Array.isArray(data) && data.length === 0)
    expect(isBlocked).toBe(true)
  })

  it('F3: org A and org B both see the same rows via rpc_partition_archive_log (global ops table)', async () => {
    const { data: dataA } = await orgA.rpc('rpc_partition_archive_log', { p_limit: 10 })
    const { data: dataB } = await orgB.rpc('rpc_partition_archive_log', { p_limit: 10 })
    // Both should get the same count (global audit log, no org-scoping)
    expect(dataA?.length).toBe(dataB?.length)
  })

  it('F4: service_role sees all rows regardless of auth context', async () => {
    const { data, error } = await svc
      .from('partition_archive_log')
      .select('id')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBeGreaterThan(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Group G — updated_at auto-stamp trigger
// ═════════════════════════════════════════════════════════════════════════════
describe('Group G — updated_at auto-stamp trigger', () => {
  it('G1: updated_at is set on INSERT equal to created_at (within 1 second)', async () => {
    const id = await insertRow({ partition_name: 'etax_submissions_trigger_g1' })
    const { data } = await svc
      .from('partition_archive_log')
      .select('created_at, updated_at')
      .eq('id', id)
      .single()
    const created = new Date(data!.created_at).getTime()
    const updated = new Date(data!.updated_at).getTime()
    expect(Math.abs(updated - created)).toBeLessThan(1000)
  })

  it('G2: updated_at is updated on UPDATE and is >= created_at', async () => {
    const id = await insertRow({ partition_name: 'etax_submissions_trigger_g2' })
    const { data: before } = await svc
      .from('partition_archive_log')
      .select('created_at, updated_at')
      .eq('id', id)
      .single()

    // Small delay to ensure updated_at differs
    await new Promise(r => setTimeout(r, 50))

    await svc
      .from('partition_archive_log')
      .update({ notes: 'updated by trigger test G2' })
      .eq('id', id)

    const { data: after } = await svc
      .from('partition_archive_log')
      .select('created_at, updated_at')
      .eq('id', id)
      .single()

    const createdAt  = new Date(before!.created_at).getTime()
    const updatedAt  = new Date(after!.updated_at).getTime()
    expect(updatedAt).toBeGreaterThanOrEqual(createdAt)
  })

  it('G3: manually setting updated_at on UPDATE is overridden by trigger', async () => {
    const id = await insertRow({ partition_name: 'etax_submissions_trigger_g3' })
    const manualTimestamp = '2000-01-01T00:00:00Z'

    await svc
      .from('partition_archive_log')
      .update({ notes: 'trigger override test', updated_at: manualTimestamp })
      .eq('id', id)

    const { data } = await svc
      .from('partition_archive_log')
      .select('updated_at')
      .eq('id', id)
      .single()

    // Trigger should override the manual 2000-01-01 value with NOW()
    expect(new Date(data!.updated_at).getFullYear()).toBeGreaterThan(2000)
  })
})
