// src/components/accounting/ChartOfAccounts.tsx
// Chart of Accounts management component — tree view with add/edit/deactivate
// Data: accounts table (Migration 0179)

import React, { useState } from 'react'
import type { Account } from '@/hooks/useAccounting'

interface ChartOfAccountsProps {
  tree: Account[]
  flat: Account[]
  isLoading: boolean
  onCreateAccount: (payload: Omit<Account, 'id' | 'org_id' | 'balance' | 'children'>) => Promise<void>
  onUpdateAccount:  (id: string, patch: Partial<Account>) => Promise<void>
  onDeactivate:     (id: string) => Promise<void>
  bookId: string
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET:     'Asset',
  LIABILITY: 'Liability',
  EQUITY:    'Equity',
  REVENUE:   'Revenue',
  EXPENSE:   'Expense',
}

const TYPE_COLOURS: Record<string, string> = {
  ASSET:     'bg-blue-100 text-blue-700',
  LIABILITY: 'bg-amber-100 text-amber-700',
  EQUITY:    'bg-purple-100 text-purple-700',
  REVENUE:   'bg-emerald-100 text-emerald-700',
  EXPENSE:   'bg-red-100 text-red-700',
}

// ─── Account row (recursive) ──────────────────────────────────────────────────

function AccountRow({
  account,
  depth,
  onEdit,
  onDeactivate,
}: {
  account: Account
  depth: number
  onEdit: (a: Account) => void
  onDeactivate: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = (account.children?.length ?? 0) > 0
  const indent = depth * 20

  return (
    <>
      <tr className="group hover:bg-gray-50">
        <td className="px-3 py-2" style={{ paddingLeft: `${indent + 12}px` }}>
          <div className="flex items-center gap-1.5">
            {hasChildren
              ? (
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:text-gray-700"
                >
                  {expanded ? '▾' : '▸'}
                </button>
                )
              : <span className="ml-4" />
            }
            <span className="font-mono text-xs text-gray-500">{account.code}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-sm font-medium text-gray-900">{account.name}</td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLOURS[account.type] ?? 'bg-gray-100 text-gray-600'}`}>
            {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
          </span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-sm text-gray-700">
          {account.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => onEdit(account)}
              className="rounded px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50"
            >
              Edit
            </button>
            <button
              onClick={() => onDeactivate(account.id)}
              className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
            >
              Deactivate
            </button>
          </div>
        </td>
      </tr>
      {expanded && hasChildren && account.children!.map(child => (
        <AccountRow
          key={child.id}
          account={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDeactivate={onDeactivate}
        />
      ))}
    </>
  )
}

// ─── Account form modal ───────────────────────────────────────────────────────

function AccountFormModal({
  mode,
  initial,
  flat,
  bookId,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit'
  initial?: Account
  flat: Account[]
  bookId: string
  onSave: (data: any) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState({
    code:        initial?.code        ?? '',
    name:        initial?.name        ?? '',
    type:        initial?.type        ?? 'ASSET',
    parent_id:   initial?.parent_id   ?? '',
    description: initial?.description ?? '',
    is_active:   initial?.is_active   ?? true,
    book_id:     bookId,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave({ ...form, parent_id: form.parent_id || null })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'New Account' : 'Edit Account'}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {mode === 'create' ? 'New Account' : 'Edit Account'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 p-4">
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Account Code *</label>
              <input
                required
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="e.g. 1100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type *</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {Object.keys(ACCOUNT_TYPE_LABELS).map(t => (
                  <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Account Name *</label>
            <input
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="e.g. Cash and Bank"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Parent Account</label>
            <select
              value={form.parent_id}
              onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">— None (root account) —</option>
              {flat
                .filter(a => a.id !== initial?.id)
                .map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))
              }
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Create Account' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChartOfAccounts({
  tree, flat, isLoading, bookId,
  onCreateAccount, onUpdateAccount, onDeactivate,
}: ChartOfAccountsProps) {
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; account?: Account } | null>(null)

  const handleDeactivate = async (id: string) => {
    if (window.confirm('Deactivate this account? It will no longer appear in journal entries.')) {
      await onDeactivate(id)
    }
  }

  const totalAssets      = flat.filter(a => a.type === 'ASSET').reduce((s, a) => s + a.balance, 0)
  const totalLiabilities = flat.filter(a => a.type === 'LIABILITY').reduce((s, a) => s + a.balance, 0)
  const totalRevenue     = flat.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.balance, 0)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
        {[
          { label: 'Total Accounts', value: flat.length.toString(), colour: 'text-gray-900' },
          { label: 'Assets',        value: `฿${totalAssets.toLocaleString()}`,      colour: 'text-blue-700'    },
          { label: 'Liabilities',   value: `฿${totalLiabilities.toLocaleString()}`, colour: 'text-amber-700'   },
          { label: 'Revenue',       value: `฿${totalRevenue.toLocaleString()}`,      colour: 'text-emerald-700' },
        ].map(({ label, value, colour }) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`mt-0.5 text-sm font-bold ${colour}`}>{value}</p>
          </div>
        ))}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            + New Account
          </button>
        </div>
      </div>

      {/* Tree table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2.5 text-left">Code</th>
                <th className="px-3 py-2.5 text-left">Name</th>
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-right">Balance (THB)</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                      </td>
                    ))}
                  </tr>
                ))
                : tree.length === 0
                  ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm text-gray-400">
                        No accounts found. Click &ldquo;+ New Account&rdquo; to create the first account.
                      </td>
                    </tr>
                    )
                  : tree.map(account => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      depth={0}
                      onEdit={a => setModal({ mode: 'edit', account: a })}
                      onDeactivate={handleDeactivate}
                    />
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <AccountFormModal
          mode={modal.mode}
          initial={modal.account}
          flat={flat}
          bookId={bookId}
          onSave={modal.mode === 'create'
            ? onCreateAccount
            : (data) => onUpdateAccount(modal.account!.id, data)
          }
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
