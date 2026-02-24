/**
 * AdminOverrideDialog.tsx - Admin Override for Quarantined Keys
 *
 * Allows admin to override quarantine status for keys with scope mismatch
 * or other QUARANTINE-severity guard decisions.
 *
 * POLICY:
 * - Admin must authenticate with passphrase (time-limited session)
 * - Override reason is required (audit trail)
 * - All overrides are logged to audit
 */

import React, { useState, useMemo } from 'react';
import {
  isAdminSessionActive,
  isAdminBootstrapped,
  adminLogin,
  adminBootstrap,
  getAdminSessionExpiry,
} from '../../runtime/admin';
import { audit } from '../../release/keys/audit';
import { isOverrideUIAllowed } from '../../core/auth/permissions';

// ============================================
// CONSTANTS
// ============================================

const OVERRIDE_REASON_MIN_LENGTH = 8;

// ============================================
// PROPS
// ============================================

interface AdminOverrideDialogProps {
  /** Key ID being overridden */
  keyId: string;

  /** Quarantine reason to display */
  quarantineReason: string;

  /** Cancel callback */
  onCancel: () => void;

  /** Success callback - called after admin override is approved */
  onOverride: (args: { overriddenBy: string; overrideReason: string }) => void;

  /** Loading state (during submission) */
  loading?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export function AdminOverrideDialog({
  keyId,
  quarantineReason,
  onCancel,
  onOverride,
  loading = false,
}: AdminOverrideDialogProps) {
  // Priority 0: Hide in production unless ADMIN
  if (!isOverrideUIAllowed()) {
    return null;
  }

  // Admin auth state
  const [passphrase, setPassphrase] = useState('');
  const [authError, setAuthError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [sessionActive, setSessionActive] = useState(isAdminSessionActive());

  // Override form state
  const [overriddenBy, setOverriddenBy] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  // Bootstrap state (first-time setup)
  const [bootstrapped, setBootstrapped] = useState(isAdminBootstrapped());
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [bootstrapError, setBootstrapError] = useState('');

  // Validation
  const isOverriddenByValid = overriddenBy.trim().length > 0;
  const isReasonValid = overrideReason.trim().length >= OVERRIDE_REASON_MIN_LENGTH;
  const canOverride = sessionActive && isOverriddenByValid && isReasonValid && !loading;

  // Reason character count display
  const reasonLength = overrideReason.trim().length;
  const reasonColor = reasonLength >= OVERRIDE_REASON_MIN_LENGTH ? 'text-green-400' : 'text-gray-500';

  // Session expiry display
  const sessionExpiry = useMemo(() => {
    if (!sessionActive) return null;
    return getAdminSessionExpiry();
  }, [sessionActive]);

  // Bootstrap handler
  const handleBootstrap = async () => {
    setBootstrapError('');
    if (newPassphrase.length < 8) {
      setBootstrapError('Passphrase must be at least 8 characters');
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      setBootstrapError('Passphrases do not match');
      return;
    }
    try {
      await adminBootstrap(newPassphrase);
      setBootstrapped(true);
      // Auto-login after bootstrap
      const success = await adminLogin(newPassphrase);
      if (success) {
        setSessionActive(true);
      }
    } catch (e) {
      setBootstrapError(e instanceof Error ? e.message : 'Bootstrap failed');
    }
  };

  // Login handler
  const handleLogin = async () => {
    setAuthError('');
    setAuthenticating(true);
    try {
      const success = await adminLogin(passphrase);
      if (success) {
        setSessionActive(true);
        setPassphrase('');
      } else {
        setAuthError('Invalid passphrase');
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setAuthenticating(false);
    }
  };

  // Override handler
  const handleOverride = () => {
    // Log to audit
    audit('KEY_OVERRIDE_TRUST', overriddenBy.trim(), {
      keyId,
      reason: overrideReason.trim(),
      quarantineReason,
    });

    onOverride({
      overriddenBy: overriddenBy.trim(),
      overrideReason: overrideReason.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-[560px] max-w-[92vw] bg-gray-900 border border-gray-700 rounded-xl p-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔐</span>
            <h3 className="text-lg font-bold text-white">Admin Override</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={loading || authenticating}
            className="text-gray-400 hover:text-white text-xl px-2"
          >
            &times;
          </button>
        </div>

        {/* Quarantine Info */}
        <div className="mt-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <div className="flex items-start gap-2">
            <span className="text-amber-400">⚠️</span>
            <div>
              <div className="font-semibold text-amber-300">Key Quarantined</div>
              <div className="text-sm text-amber-200/80 mt-1">{quarantineReason}</div>
              <div className="text-xs text-gray-400 font-mono mt-2">Key: {keyId}</div>
            </div>
          </div>
        </div>

        <hr className="border-gray-700 my-4" />

        {/* Bootstrap UI (first-time setup) */}
        {!bootstrapped && (
          <div className="mb-4">
            <div className="text-amber-400 font-semibold mb-3">
              🔧 First-time Setup: Create Admin Passphrase
            </div>
            <div className="space-y-3">
              <div>
                <input
                  type="password"
                  value={newPassphrase}
                  onChange={(e) => setNewPassphrase(e.target.value)}
                  placeholder="New passphrase (min 8 chars)"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
                />
              </div>
              <div>
                <input
                  type="password"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  placeholder="Confirm passphrase"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
                />
              </div>
              {bootstrapError && (
                <div className="text-red-400 text-sm">{bootstrapError}</div>
              )}
              <button
                onClick={handleBootstrap}
                className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors"
              >
                Create Admin Passphrase
              </button>
            </div>
          </div>
        )}

        {/* Login UI */}
        {bootstrapped && !sessionActive && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-white mb-2">
              Admin Authentication
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Enter admin passphrase"
                disabled={authenticating}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 disabled:opacity-50"
              />
              <button
                onClick={handleLogin}
                disabled={authenticating || !passphrase}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {authenticating ? '...' : 'Login'}
              </button>
            </div>
            {authError && (
              <div className="text-red-400 text-sm mt-2">{authError}</div>
            )}
          </div>
        )}

        {/* Session Active Indicator */}
        {sessionActive && (
          <div className="mb-4 p-2 bg-green-900/30 border border-green-700/50 rounded-lg">
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <span>✓</span>
              <span>Admin session active</span>
              {sessionExpiry && (
                <span className="text-gray-400 text-xs ml-auto">
                  expires: {new Date(sessionExpiry).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Override Form (only when authenticated) */}
        {sessionActive && (
          <>
            {/* Overridden By */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-white mb-2">
                Override By <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={overriddenBy}
                onChange={(e) => setOverriddenBy(e.target.value)}
                placeholder="e.g., Admin-01, IT-Lead, Factory-Manager"
                disabled={loading}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 disabled:opacity-50"
              />
              <div className="text-xs text-gray-500 mt-1">
                Who approved this override (audited)
              </div>
            </div>

            {/* Override Reason */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-white mb-2">
                Override Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why this quarantine should be overridden. Include justification for accepting the scope mismatch."
                disabled={loading}
                className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 resize-none disabled:opacity-50"
              />
              <div className={`text-xs mt-1 ${reasonColor}`}>
                {reasonLength}/{OVERRIDE_REASON_MIN_LENGTH} characters minimum
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={loading || authenticating}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleOverride}
            disabled={!canOverride}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Processing...' : 'Override & Trust Key'}
          </button>
        </div>

        {/* Audit Notice */}
        <div className="mt-4 p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg">
          <div className="text-xs text-amber-300">
            Admin overrides are audited (who/why/when) and logged permanently.
            Use only when necessary and document the justification clearly.
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminOverrideDialog;
