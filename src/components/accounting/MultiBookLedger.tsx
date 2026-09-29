// src/components/accounting/MultiBookLedger.tsx
// Multi-book ledger component — journal entry list + line detail
// Data: journal_entries + journal_lines tables (Migration 0179)

import React, { useState } from 'react'
import type { JournalEntry, JournalLine } from '@/hooks/useAccounting'

interface MultiBookLedgerProps {
  entries: JournalEntry[]
  totalCount: number
  isLoading: boolean
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}

const STATUS_STYLES: Record<string, string> = {
  draft:   'bg-gray-100 text-gray-600',
  posted:  'bg-emerald-100 text-emerald-700',
  voided:  'bg-red-100 text-red-500 line-through',
}

function JournalLineDetail({ lines }: { lines: JournalLine[] }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 uppercase tracking-wide">
            <th className="py-1 text-left">Account</th>
            <th className="py-1 text-left">Description</th>
            <th className="py-1 text-right">Debit (THB)</th>
            <th className="py-1 text-right">Credit (THB)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map(line => (
            <tr key={line.id}>
              <td className="py-1.5 font-mono text-gray-600">
                {line.account_code} <span className="text-gray-500">{line.account_name}</span>
              </td>
              <td className="py-1.5 text-gray-500">{line.description ?? '—'}</td>
              <td className="py-1.5 text-right tabular-nums text-blue-700">
                {line.debit > 0 ? line.debit.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : ''}
              </td>
              <td className="py-1.5 text-right tabular-nums text-red-600">
                {line.credit > 0 ? line.credit.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : ''}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 font-semibold">
            <td colSpan={2} className="py-1 text-xs text-gray-500">Totals</td>
            <td className="py-1 text-right tabular-nums text-blue-700">
              {lines.reduce((s, l) => s + l.debit, 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </td>
            <td className="py-1 text-right tabular-nums text-red-600">
              {lines.reduce((s, l) => s + l.credit, 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function EntryRow({ entry }: { entry: JournalEntry }) {
  const [expanded, setExpanded] = useState(false)
  const isBalanced = Math.abs(entry.total_debit - entry.total_credit) < 0.01

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-gray-50 ${entry.status === 'voided' ? 'opacity-50' : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-gray-400">{expanded ? '▾' : '▸'}</span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-700">
          {new Date(entry.entry_date).toLocaleDateString('th-TH')}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-gray-500">
          {entry.reference ?? '—'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
          {entry.description ?? '—'}
        </td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[entry.status] ?? 'bg-gray-100'}`}>
            {entry.status}
          </span>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-sm text-blue-700">
          {entry.total_debit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-sm text-red-600">
          {entry.total_credit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3 text-center">
          {isBalanced
            ? <span className="text-emerald-500 text-xs">✓</span>
            : <span className="text-red-500 text-xs font-bold">!</span>
          }
        </td>
      </tr>
      {expanded && entry.lines && entry.lines.length > 0 && (
        <tr>
          <td colSpan={8} className="px-8 py-2">
            <JournalLineDetail lines={entry.lines} />
          </td>
        </tr>
      )}
    </>
  )
}

export function MultiBookLedger({
  entries, totalCount, isLoading, page, pageSize, onPageChange,
}: MultiBookLedgerProps) {
  const totalPages   = Math.ceil(totalCount / pageSize)
  const startEntry   = page * pageSize + 1
  const endEntry     = Math.min((page + 1) * pageSize, totalCount)

  const totalDr = entries.reduce((s, e) => s + e.total_debit, 0)
  const totalCr = entries.reduce((s, e) => s + e.total_credit, 0)

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
        <div>
          <span className="text-xs text-gray-500">Entries on page</span>
          <span className="ml-2 font-semibold text-gray-900">{entries.length}</span>
        </div>
        <div className="border-l border-gray-200 pl-4">
          <span className="text-xs text-gray-500">Total Debit</span>
          <span className="ml-2 font-semibold text-blue-700">
            ฿{totalDr.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="border-l border-gray-200 pl-4">
          <span className="text-xs text-gray-500">Total Credit</span>
          <span className="ml-2 font-semibold text-red-600">
            ฿{totalCr.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </span>
        </div>
        {Math.abs(totalDr - totalCr) > 0.01 && (
          <div className="ml-auto rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
            ⚠ Out of balance: {Math.abs(totalDr - totalCr).toFixed(2)}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5 w-8" />
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Reference</th>
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-right">Debit</th>
                <th className="px-4 py-2.5 text-right">Credit</th>
                <th className="px-4 py-2.5 text-center">OK?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                      </td>
                    ))}
                  </tr>
                ))
                : entries.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                        No journal entries found for this book.
                      </td>
                    </tr>
                    )
                  : entries.map(entry => <EntryRow key={entry.id} entry={entry} />)
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2">
            <span className="text-xs text-gray-400">
              {startEntry}–{endEntry} of {totalCount} entries
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 0}
                className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="px-2 py-1 text-xs text-gray-500">
                Page {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages - 1}
                className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
