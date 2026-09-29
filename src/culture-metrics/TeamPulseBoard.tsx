import React, { useEffect, useId, useRef, useState } from 'react';
import type { OrgPlan } from '../tenant/types';
import { useTpcStore } from './teamPulseStore';
import {
  canAccessTpcModule, TPC_TOPICS, TPC_TOPIC_LABEL, TPC_SESSION_STATUS_LABEL,
  TPC_HEALTH_STATUS_LABEL, TPC_HEALTH_STATUS_COLOR, type TpcTopic,
} from './teamPulseTypes';

interface TeamPulseBoardProps {
  orgId: string;
  plan: OrgPlan;
  isAdmin: boolean;
  userId?: string;
}

// Remount before any old identity's local form or cached data can be displayed.
export default function TeamPulseBoard(props: TeamPulseBoardProps) {
  const identity = JSON.stringify([props.orgId, props.plan, props.isAdmin, props.userId ?? null]);
  return <TeamPulsePanel key={identity} {...props} />;
}

const inputClass = 'w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
const buttonClass = 'rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';

function TeamPulsePanel({ orgId, plan, isAdmin, userId }: TeamPulseBoardProps) {
  const {
    sessions, summaries, activeSessionId, loading, error, setContext, setActiveSession,
    fetchSessions, fetchSummary, createSession, activateSession, closeSession, submitResponse,
  } = useTpcStore();
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState('');
  const [topic, setTopic] = useState<TpcTopic>('WORKLOAD');
  const [score, setScore] = useState('3');
  const [comment, setComment] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const formId = useId();
  const canAccess = canAccessTpcModule(plan);
  const busy = pending || loading;

  useEffect(() => {
    mounted.current = true;
    // User/role can change without changing the org or plan. Reset explicitly.
    setContext(null, null);
    setContext(orgId, plan);
    if (canAccess) {
      void fetchSessions(orgId, plan);
      if (isAdmin) void fetchSummary(orgId, plan);
    }
    setReady(true);
    return () => {
      mounted.current = false;
      setContext(null, null);
    };
  }, [orgId, plan, isAdmin, userId, canAccess, setContext, fetchSessions, fetchSummary]);

  async function perform(action: () => Promise<boolean>, success: () => void | Promise<void>) {
    if (inFlight.current || busy || !mounted.current) return;
    inFlight.current = true;
    setPending(true);
    setLocalError('');
    setNotice('');
    try {
      const confirmed = await action();
      if (!mounted.current) return;
      if (confirmed) await success();
      else setLocalError(useTpcStore.getState().error || 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
    } catch {
      if (mounted.current) setLocalError('ทำรายการไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  if (!canAccess) return (
    <div data-testid="tpc-plan-gate" className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
      Team Pulse ต้องการแผน PROFESSIONAL หรือ ENTERPRISE
    </div>
  );
  // This local guard is false on the first render after every identity change.
  if (!ready) return <div role="status" aria-busy="true" className="rounded-lg bg-gray-50 p-4 text-gray-900">กำลังเตรียม Team Pulse</div>;

  const visibleSessions = sessions.filter(session => session.orgId === orgId && (isAdmin || session.status !== 'DRAFT'));
  const selected = visibleSessions.find(session => session.id === activeSessionId) ?? visibleSessions[0];
  const selectedSummary = summaries.filter(row => row.orgId === orgId && row.sessionId === selected?.id);

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !period.trim()) {
      setLocalError('กรุณากรอกชื่อรอบและช่วงเวลา');
      return;
    }
    void perform(() => createSession({ orgId, title: title.trim(), periodLabel: period.trim() }, plan), () => {
      setTitle(''); setPeriod(''); setNotice('สร้างรอบฉบับร่างแล้ว');
    });
  }

  function handleResponse(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(score);
    if (!score.trim() || !Number.isInteger(value) || value < 1 || value > 5) {
      setLocalError('กรุณาเลือกคะแนนเป็นจำนวนเต็มตั้งแต่ 1 ถึง 5');
      return;
    }
    if (!selected || selected.status !== 'ACTIVE') return;
    void perform(() => submitResponse({
      orgId, sessionId: selected.id, topic, score: value, comment: comment.trim() || undefined,
    }), async () => {
      setComment(''); setScore('3'); setTopic('WORKLOAD'); setNotice('บันทึกคำตอบแล้ว');
      if (isAdmin) await fetchSummary(orgId, plan);
    });
  }

  return (
    <section data-testid="tpc-board" className="space-y-5 rounded-lg bg-gray-50 p-4 text-gray-900" style={{ colorScheme: 'light' }} aria-label="Team Pulse" aria-busy={busy}>
      <header>
        <h2 className="text-lg font-semibold text-gray-900">Team Pulse</h2>
        <p className="text-sm text-gray-500">รับฟังความคิดเห็นของทีมในแต่ละรอบ</p>
      </header>
      {(localError || error) && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-700">
        <p>{localError || error}</p>
        <button type="button" className="mt-2 underline" disabled={busy} onClick={() => {
          void perform(async () => {
            const results = await Promise.all([fetchSessions(orgId, plan), ...(isAdmin ? [fetchSummary(orgId, plan)] : [])]);
            return results.every(Boolean);
          }, () => {});
        }}>โหลดข้อมูลใหม่</button>
      </div>}
      {notice && <p role="status" className="rounded bg-green-50 p-3 text-green-800">{notice}</p>}
      {busy && <p role="status" className="text-sm text-gray-500">กำลังดำเนินการ…</p>}

      {isAdmin && <form data-testid="tpc-create-form" noValidate onSubmit={handleCreate} className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 font-medium">สร้างรอบใหม่</h3>
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${formId}-title`} className="text-sm">ชื่อรอบ
            <input id={`${formId}-title`} className={inputClass} value={title} onChange={event => setTitle(event.target.value)} />
          </label>
          <label htmlFor={`${formId}-period`} className="text-sm">ช่วงเวลา
            <input id={`${formId}-period`} className={inputClass} placeholder="เช่น 2027-W12" value={period} onChange={event => setPeriod(event.target.value)} />
          </label>
          <button type="submit" className={buttonClass}>สร้างรอบฉบับร่าง</button>
        </fieldset>
      </form>}

      <div>
        <h3 className="mb-2 font-medium">รอบแบบสอบถาม</h3>
        {visibleSessions.length === 0 && !loading && <p className="rounded border border-dashed p-5 text-sm text-gray-500">ยังไม่มีรอบ Team Pulse</p>}
        <ul className="space-y-2">
          {visibleSessions.map(session => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3">
            <button type="button" className="text-left text-sm" aria-pressed={selected?.id === session.id} disabled={busy}
              onClick={() => { setActiveSession(session.id); setNotice(''); setLocalError(''); }}>
              <span className="font-medium">{session.title}</span>
              <span className="ml-2 text-gray-500">{session.periodLabel} · {TPC_SESSION_STATUS_LABEL[session.status]}</span>
            </button>
            {isAdmin && session.status === 'DRAFT' && <button type="button" data-testid="tpc-activate" className={buttonClass} disabled={busy}
              onClick={() => { void perform(() => activateSession(session.id, orgId, plan), () => { setNotice('เปิดรอบแล้ว'); }); }}>เปิดรับคำตอบ</button>}
            {isAdmin && session.status === 'ACTIVE' && <button type="button" data-testid="tpc-close" className={buttonClass} disabled={busy}
              onClick={() => { void perform(() => closeSession(session.id, orgId, plan), async () => {
                setNotice('ปิดรอบแล้ว'); await fetchSummary(orgId, plan);
              }); }}>ปิดรอบ</button>}
          </li>)}
        </ul>
      </div>

      {selected && <section className="space-y-3" aria-label="รอบที่เลือก">
        <h3 className="font-medium">รอบที่เลือก: {selected.title}</h3>
        {isAdmin && <div data-testid="tpc-summary" className="rounded-lg border bg-white p-4">
          <h4 className="mb-3 font-medium">สรุปคำตอบ</h4>
          {selectedSummary.length === 0 ? <p className="text-sm text-gray-500">ยังไม่มีสรุปคำตอบในรอบนี้</p> :
            <ul className="grid gap-3 sm:grid-cols-2">{selectedSummary.map(row => <li key={row.topic} className="rounded border p-3">
              <p>{TPC_TOPIC_LABEL[row.topic]}</p>
              <p className="text-xl font-semibold">{row.avgScore.toFixed(1)}</p>
              <p className="text-sm text-gray-500">{row.responseCount} คำตอบ</p>
              {row.healthStatus ? <span className={`rounded px-2 py-1 text-xs ${TPC_HEALTH_STATUS_COLOR[row.healthStatus]}`}>{TPC_HEALTH_STATUS_LABEL[row.healthStatus]}</span>
                : <span className="text-xs text-gray-500">ข้อมูลไม่เพียงพอสำหรับสถานะ</span>}
            </li>)}</ul>}
        </div>}
        {selected.status === 'CLOSED' && <p className="text-sm text-gray-500">รอบนี้ปิดรับคำตอบแล้ว</p>}
        {selected.status === 'ACTIVE' && <form data-testid="tpc-response-form" noValidate onSubmit={handleResponse} className="space-y-3 rounded-lg border bg-white p-4">
          <h4 className="font-medium">ตอบรอบนี้</h4>
          <p className="text-xs text-gray-500">รายการคำตอบไม่บันทึกรหัสผู้ใช้ กรุณาไม่ใส่ชื่อหรือข้อมูลส่วนบุคคลในความคิดเห็น</p>
          <fieldset disabled={busy} className="space-y-3">
            <label htmlFor={`${formId}-topic`} className="block text-sm">หัวข้อ
              <select id={`${formId}-topic`} className={inputClass} value={topic} onChange={event => setTopic(event.target.value as TpcTopic)}>
                {TPC_TOPICS.map(value => <option key={value} value={value}>{TPC_TOPIC_LABEL[value]}</option>)}
              </select>
            </label>
            <label htmlFor={`${formId}-score`} className="block text-sm">คะแนน (1–5)
              <input id={`${formId}-score`} className={inputClass} type="number" min={1} max={5} step={1} value={score} onChange={event => setScore(event.target.value)} />
            </label>
            <label htmlFor={`${formId}-comment`} className="block text-sm">ความคิดเห็น (ไม่บังคับ)
              <textarea id={`${formId}-comment`} className={inputClass} value={comment} onChange={event => setComment(event.target.value)} />
            </label>
            <button type="submit" className={buttonClass}>ส่งคำตอบ</button>
          </fieldset>
        </form>}
      </section>}
    </section>
  );
}
