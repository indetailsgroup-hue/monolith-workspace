/**
 * notifications/NotificationPreferencesPage.tsx — Email Digest & Alert Preferences
 *
 * Route: /settings/notifications
 * Access: Any authenticated user within their org
 *
 * Features:
 * - Per-category email digest frequency (immediate/daily/weekly/none)
 * - Per-category in-app toggle
 * - Global mute / snooze
 * - Quiet hours configuration
 */

import React, { useState, useCallback } from 'react';
import { useNotificationStore } from './notificationStore';
import type { NotificationCategory, DigestFrequency } from './notificationTypes';
import {
  NOTIFICATION_CATEGORY_LABELS,
  DIGEST_FREQUENCY_LABELS,
} from './notificationTypes';

// ============================================================================
// Main Component
// ============================================================================

export function NotificationPreferencesPage() {
  const {
    preferences,
    updateDigestFrequency,
    toggleInApp,
    toggleGlobalMute,
    setMuteUntil,
  } = useNotificationStore();
  const [saved, setSaved] = useState(false);
  const [quietStart, setQuietStart] = useState(preferences?.quietHoursStart || '');
  const [quietEnd, setQuietEnd] = useState(preferences?.quietHoursEnd || '');

  const handleSave = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const handleSnooze = useCallback((hours: number) => {
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    setMuteUntil(until);
  }, [setMuteUntil]);

  if (!preferences) {
    return (
      <div className="notif-prefs-page">
        <p>กำลังโหลดการตั้งค่า...</p>
      </div>
    );
  }

  const categories = Object.keys(NOTIFICATION_CATEGORY_LABELS) as NotificationCategory[];
  const frequencies: DigestFrequency[] = ['immediate', 'daily', 'weekly', 'none'];

  return (
    <div className="notif-prefs-page" data-testid="notification-preferences">
      <header className="notif-prefs-header">
        <h1>🔔 ตั้งค่าการแจ้งเตือน</h1>
        <p>จัดการการแจ้งเตือนในแอปและอีเมลสำหรับองค์กรของคุณ</p>
      </header>

      {/* Global Mute */}
      <section className="notif-prefs-section">
        <h2>🔇 ปิดเสียงทั้งหมด</h2>
        <div className="notif-prefs-row">
          <label className="notif-toggle-label">
            <input
              type="checkbox"
              checked={preferences.globalMute}
              onChange={toggleGlobalMute}
            />
            <span>ปิดเสียงการแจ้งเตือนทั้งหมด</span>
          </label>
        </div>
        <div className="notif-snooze-btns">
          <span>หยุดชั่วคราว:</span>
          <button onClick={() => handleSnooze(1)}>1 ชม.</button>
          <button onClick={() => handleSnooze(4)}>4 ชม.</button>
          <button onClick={() => handleSnooze(24)}>24 ชม.</button>
          <button onClick={() => setMuteUntil(undefined)}>ยกเลิก</button>
        </div>
        {preferences.muteUntil && new Date(preferences.muteUntil) > new Date() && (
          <p className="notif-mute-info">
            🔕 ปิดเสียงจนถึง {new Date(preferences.muteUntil).toLocaleString('th-TH')}
          </p>
        )}
      </section>

      {/* Per-Category Preferences */}
      <section className="notif-prefs-section">
        <h2>📬 การแจ้งเตือนตามหมวดหมู่</h2>
        <div className="notif-prefs-table">
          <div className="notif-prefs-table-header">
            <span>หมวดหมู่</span>
            <span>แจ้งเตือนในแอป</span>
            <span>อีเมลสรุป</span>
          </div>
          {categories.map(cat => (
            <div key={cat} className="notif-prefs-table-row">
              <span className="notif-cat-label">{NOTIFICATION_CATEGORY_LABELS[cat]}</span>
              <label className="notif-toggle">
                <input
                  type="checkbox"
                  checked={preferences.inAppEnabled[cat]}
                  onChange={() => toggleInApp(cat)}
                />
                <span className="notif-toggle-slider" />
              </label>
              <select
                value={preferences.emailDigest[cat]}
                onChange={e => updateDigestFrequency(cat, e.target.value as DigestFrequency)}
                className="notif-digest-select"
              >
                {frequencies.map(freq => (
                  <option key={freq} value={freq}>
                    {DIGEST_FREQUENCY_LABELS[freq]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      {/* Quiet Hours */}
      <section className="notif-prefs-section">
        <h2>🌙 ช่วงเวลาเงียบ</h2>
        <p>ไม่ส่งการแจ้งเตือนในแอประหว่างช่วงเวลาที่กำหนด</p>
        <div className="notif-quiet-hours">
          <label>
            เริ่ม:
            <input
              type="time"
              value={quietStart}
              onChange={e => setQuietStart(e.target.value)}
            />
          </label>
          <label>
            ถึง:
            <input
              type="time"
              value={quietEnd}
              onChange={e => setQuietEnd(e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* Save Button */}
      <div className="notif-prefs-footer">
        <button onClick={handleSave} className="notif-save-btn">
          {saved ? '✅ บันทึกแล้ว' : '💾 บันทึกการตั้งค่า'}
        </button>
      </div>
    </div>
  );
}

export default NotificationPreferencesPage;
