// src/hooks/useAccounting.ts
// Data-fetching hooks for Chart of Accounts and Multi-book Ledger
// Targets: books table, accounts/chart_of_accounts, journal_entries, journal_lines
// (Migration 0179 — multibook_dynamic)

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/core/supabase'

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface Book {
  id: string
  org_id: string
  name: string
  currency: string
  is_default: boolean
  description: string | null
  created_at: string
}

export interface Account {
  id: string
  org_id: string
  book_id: string | null
  code: string
  name: string
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  parent_id: string | null
  balance: number
  is_active: boolean
  description: string | null
  children?: Account[]
}

export interface JournalEntry {
  id: string
  org_id: string
  book_id: string
  entry_date: string
  reference: string | null
  description: string | null
  status: 'draft' | 'posted' | 'voided'
  total_debit: number
  total_credit: number
  created_at: string
  created_by: string | null
  lines?: JournalLine[]
}

export interface JournalLine {
  id: string
  entry_id: string
  account_id: string
  account_code: string
  account_name: string
  debit: number
  credit: number
  description: string | null
}

// ─── useBooks ─────────────────────────────────────────────────────────────────

export function useBooks() {
  const [books, setBooks] = useState<Book[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBooks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('books')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name')
    if (err) {
      setError(err.message)
    } else {
      setBooks((data ?? []) as Book[])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => { void fetchBooks() }, [fetchBooks])

  return { books, isLoading, error, refetch: fetchBooks }
}

// ─── useChartOfAccounts ───────────────────────────────────────────────────────

export function useChartOfAccounts(bookId: string | null) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [tree, setTree] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buildTree = useCallback((flat: Account[]): Account[] => {
    const map = new Map<string, Account>()
    flat.forEach(a => map.set(a.id, { ...a, children: [] }))
    const roots: Account[] = []
    map.forEach(a => {
      if (a.parent_id && map.has(a.parent_id)) {
        map.get(a.parent_id)!.children!.push(a)
      } else {
        roots.push(a)
      }
    })
    // Sort by account code within each level
    const sortChildren = (nodes: Account[]) => {
      nodes.sort((a, b) => a.code.localeCompare(b.code))
      nodes.forEach(n => { if (n.children?.length) sortChildren(n.children) })
    }
    sortChildren(roots)
    return roots
  }, [])

  const fetchAccounts = useCallback(async () => {
    if (!bookId) { setAccounts([]); setTree([]); return }
    setIsLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('accounts')
      .select('*')
      .eq('book_id', bookId)
      .eq('is_active', true)
      .order('code')

    if (err) {
      setError(err.message)
      setAccounts([])
      setTree([])
    } else {
      const flat = (data ?? []) as Account[]
      setAccounts(flat)
      setTree(buildTree(flat))
    }
    setIsLoading(false)
  }, [bookId, buildTree])

  useEffect(() => { void fetchAccounts() }, [fetchAccounts])

  const createAccount = useCallback(async (payload: Omit<Account, 'id' | 'org_id' | 'balance' | 'children'>) => {
    const { error: err } = await supabase.from('accounts').insert(payload)
    if (err) throw new Error(err.message)
    await fetchAccounts()
  }, [fetchAccounts])

  const updateAccount = useCallback(async (id: string, patch: Partial<Account>) => {
    const { error: err } = await supabase.from('accounts').update(patch).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAccounts()
  }, [fetchAccounts])

  const deactivateAccount = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('accounts').update({ is_active: false }).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAccounts()
  }, [fetchAccounts])

  return { accounts, tree, isLoading, error, refetch: fetchAccounts, createAccount, updateAccount, deactivateAccount }
}

// ─── useJournalEntries ────────────────────────────────────────────────────────

export function useJournalEntries(bookId: string | null, page = 0, pageSize = 50) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    if (!bookId) { setEntries([]); setTotalCount(0); return }
    setIsLoading(true)
    setError(null)

    const from = page * pageSize
    const to   = from + pageSize - 1

    const { data, error: err, count } = await supabase
      .from('journal_entries')
      .select('*, journal_lines(*, accounts(code, name))', { count: 'exact' })
      .eq('book_id', bookId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (err) {
      setError(err.message)
    } else {
      // Flatten joined account data into line
      const enriched = ((data ?? []) as any[]).map(entry => ({
        ...entry,
        lines: (entry.journal_lines ?? []).map((line: any) => ({
          ...line,
          account_code: line.accounts?.code ?? '',
          account_name: line.accounts?.name ?? '',
        })),
      })) as JournalEntry[]
      setEntries(enriched)
      setTotalCount(count ?? 0)
    }
    setIsLoading(false)
  }, [bookId, page, pageSize])

  useEffect(() => { void fetchEntries() }, [fetchEntries])

  return { entries, totalCount, isLoading, error, refetch: fetchEntries }
}

// ─── useAccounting ────────────────────────────────────────────────────────────
// Composite hook that combines useBooks, useChartOfAccounts, and useJournalEntries.

export function useAccounting(bookId: string | null = null) {
  const booksResult    = useBooks()
  const accountsResult = useChartOfAccounts(bookId)
  const entriesResult  = useJournalEntries(bookId)
  return {
    books:             booksResult.books,
    accounts:          accountsResult.accounts,
    tree:              accountsResult.tree,
    entries:           entriesResult.entries,
    totalCount:        entriesResult.totalCount,
    isLoading:         booksResult.isLoading || accountsResult.isLoading || entriesResult.isLoading,
    error:             booksResult.error ?? accountsResult.error ?? entriesResult.error,
    refetch:           booksResult.refetch,
    createAccount:     accountsResult.createAccount,
    updateAccount:     accountsResult.updateAccount,
    deactivateAccount: accountsResult.deactivateAccount,
  }
}
