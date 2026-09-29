// src/pages/AccountingManagement.tsx
// Centralized Accounting Management page
// Tabs: Books | Chart of Accounts | Multi-book Ledger
// Data: books table, accounts table, journal_entries (Migration 0179)

import React, { useState } from 'react'
import { useBooks, useChartOfAccounts, useJournalEntries } from '@/hooks/useAccounting'
import type { Book } from '@/hooks/useAccounting'
import { ChartOfAccounts } from '@/components/accounting/ChartOfAccounts'
import { MultiBookLedger } from '@/components/accounting/MultiBookLedger'

// ─── Book selector sidebar ────────────────────────────────────────────────────

function BookSelector({
  books, selectedId, onSelect, isLoading,
}: {
  books: Book[]
  selectedId: string | null
  onSelect: (id: string) => void
  isLoading: boolean
}) {
  return (
    <div
      className="w-48 flex-none rounded-xl border border-gray-200 bg-white p-2 shadow-sm"
      role={isLoading ? 'status' : undefined}
      aria-label={isLoading ? 'Loading accounting books' : undefined}
    >
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Books</p>
      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-1.5 h-8 w-full animate-pulse rounded-md bg-gray-100" />
        ))
        : books.length === 0
          ? <p className="px-2 text-xs text-gray-400">No books found.</p>
          : books.map(book => (
            <button
              key={book.id}
              onClick={() => onSelect(book.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition ${
                selectedId === book.id
                  ? 'bg-indigo-50 font-medium text-indigo-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="flex-1 truncate">{book.name}</span>
              {book.is_default && (
                <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-600">Default</span>
              )}
              <span className="text-xs text-gray-400">{book.currency}</span>
            </button>
          ))
      }
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ['Chart of Accounts', 'Journal Ledger'] as const
type Tab = typeof TABS[number]

// ─── Empty book state ─────────────────────────────────────────────────────────

function NoBookSelected() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-20 text-center">
      <div className="mb-3 text-4xl">📒</div>
      <h3 className="text-sm font-semibold text-gray-700">Select a Book</h3>
      <p className="mt-1 text-xs text-gray-400">Choose an accounting book from the left panel to view its data.</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccountingManagement() {
  const { books, isLoading: booksLoading, error: booksError, refetch: refetchBooks } = useBooks()
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('Chart of Accounts')
  const [ledgerPage, setLedgerPage] = useState(0)

  const selectedBook = books.find(b => b.id === selectedBookId) ?? null

  // Auto-select default book once loaded
  React.useEffect(() => {
    if (!selectedBookId && books.length > 0) {
      const def = books.find(b => b.is_default) ?? books[0]
      setSelectedBookId(def.id)
    }
  }, [books, selectedBookId])

  const {
    tree, accounts: flatAccounts, isLoading: coaLoading, error: coaError, refetch: refetchCoa,
    createAccount, updateAccount, deactivateAccount,
  } = useChartOfAccounts(selectedBookId)

  const {
    entries, totalCount, isLoading: ledgerLoading, error: ledgerError, refetch: refetchLedger,
  } = useJournalEntries(selectedBookId, ledgerPage, 50)

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setLedgerPage(0)
  }

  const handleBookSelect = (id: string) => {
    setSelectedBookId(id)
    setLedgerPage(0)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Accounting Management</h1>
            <p className="text-xs text-gray-500">
              Multi-book ledger · Chart of Accounts · Journal Entries
              {selectedBook && (
                <span className="ml-2 font-medium text-indigo-600">
                  — {selectedBook.name} ({selectedBook.currency})
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => {
              void refetchBooks()
              void refetchCoa()
              void refetchLedger()
            }}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activeTab === tab
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {tab}
              {tab === 'Chart of Accounts' && flatAccounts.length > 0 && (
                <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
                  {flatAccounts.length}
                </span>
              )}
              {tab === 'Journal Ledger' && totalCount > 0 && (
                <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
                  {totalCount.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-6">
        {(booksError || coaError || ledgerError) && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Accounting error:</strong> {booksError ?? coaError ?? ledgerError}
          </div>
        )}
        <div className="flex gap-5">
          {/* Book sidebar */}
          <BookSelector
            books={books}
            selectedId={selectedBookId}
            onSelect={handleBookSelect}
            isLoading={booksLoading}
          />

          {/* Main panel */}
          <div className="flex-1 min-w-0">
            {!selectedBookId
              ? <NoBookSelected />
              : activeTab === 'Chart of Accounts'
                ? (
                  <ChartOfAccounts
                    tree={tree}
                    flat={flatAccounts}
                    isLoading={coaLoading}
                    bookId={selectedBookId}
                    onCreateAccount={createAccount}
                    onUpdateAccount={updateAccount}
                    onDeactivate={deactivateAccount}
                  />
                  )
                : (
                  <MultiBookLedger
                    entries={entries}
                    totalCount={totalCount}
                    isLoading={ledgerLoading}
                    page={ledgerPage}
                    pageSize={50}
                    onPageChange={setLedgerPage}
                  />
                  )
            }
          </div>
        </div>
      </main>
    </div>
  )
}
