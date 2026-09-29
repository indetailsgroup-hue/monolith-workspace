/**
 * BookmarkPanel.tsx — Saved search bookmarks display + management
 * Shows pinned searches with quick-execute, rename, and delete
 * v16.7.0
 */

import React, { useState, useEffect } from 'react';
import {
  fetchBookmarks,
  createBookmark,
  deleteBookmark,
  incrementBookmarkUse,
  updateBookmarkLabel,
  type SearchBookmark,
  type CreateBookmarkParams,
} from './searchBookmarks';

export interface BookmarkPanelProps {
  onExecuteBookmark: (query: string, entityTypes: string[]) => void;
  currentQuery?: string;
}

export const BookmarkPanel: React.FC<BookmarkPanelProps> = ({
  onExecuteBookmark,
  currentQuery,
}) => {
  const [bookmarks, setBookmarks] = useState<SearchBookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  useEffect(() => {
    loadBookmarks();
  }, []);

  async function loadBookmarks() {
    setLoading(true);
    try {
      const data = await fetchBookmarks();
      setBookmarks(data);
    } catch (err) {
      console.warn('Failed to load bookmarks:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePin() {
    if (!currentQuery?.trim()) return;
    const params: CreateBookmarkParams = {
      label: currentQuery.trim(),
      query: currentQuery.trim(),
      entityTypes: ['job', 'member', 'invoice'],
    };
    try {
      const bm = await createBookmark(params);
      setBookmarks((prev) => [bm, ...prev]);
    } catch (err) {
      console.warn('Failed to pin bookmark:', err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteBookmark(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.warn('Failed to delete bookmark:', err);
    }
  }

  async function handleExecute(bm: SearchBookmark) {
    await incrementBookmarkUse(bm.id);
    onExecuteBookmark(bm.query, bm.entityTypes);
  }

  async function handleRename(id: string) {
    if (!editLabel.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateBookmarkLabel(id, editLabel.trim());
      setBookmarks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, label: editLabel.trim() } : b))
      );
    } catch (err) {
      console.warn('Failed to rename bookmark:', err);
    }
    setEditingId(null);
  }

  const isAlreadyPinned = bookmarks.some((b) => b.query === currentQuery?.trim());

  return (
    <div className="bookmark-panel" data-testid="bookmark-panel">
      {/* Pin current search button */}
      {currentQuery?.trim() && !isAlreadyPinned && (
        <button
          className="pin-bookmark-btn"
          onClick={handlePin}
          data-testid="pin-bookmark-btn"
          aria-label="Pin current search"
        >
          📌 Pin "{currentQuery.trim()}"
        </button>
      )}

      {/* Bookmark list */}
      {loading ? (
        <div className="bookmark-loading" data-testid="bookmark-loading">Loading...</div>
      ) : bookmarks.length === 0 ? (
        <div className="bookmark-empty" data-testid="bookmark-empty">
          No saved searches yet. Pin a query to access it quickly.
        </div>
      ) : (
        <ul className="bookmark-list" data-testid="bookmark-list">
          {bookmarks.map((bm) => (
            <li key={bm.id} className="bookmark-item" data-testid={`bookmark-${bm.id}`}>
              {editingId === bm.id ? (
                <input
                  className="bookmark-edit-input"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={() => handleRename(bm.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(bm.id)}
                  autoFocus
                  data-testid="bookmark-edit-input"
                />
              ) : (
                <>
                  <button
                    className="bookmark-exec-btn"
                    onClick={() => handleExecute(bm)}
                    data-testid={`bookmark-exec-${bm.id}`}
                    title={`Execute: ${bm.query}`}
                  >
                    🔍 {bm.label}
                  </button>
                  <span className="bookmark-count">{bm.useCount}×</span>
                  <button
                    className="bookmark-rename-btn"
                    onClick={() => { setEditingId(bm.id); setEditLabel(bm.label); }}
                    data-testid={`bookmark-rename-${bm.id}`}
                    aria-label="Rename bookmark"
                  >
                    ✏️
                  </button>
                  <button
                    className="bookmark-delete-btn"
                    onClick={() => handleDelete(bm.id)}
                    data-testid={`bookmark-delete-${bm.id}`}
                    aria-label="Delete bookmark"
                  >
                    🗑️
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BookmarkPanel;
