// S18 L3 (field-app): ช่างหน้างานไม่เสียข้อมูล — แบนเนอร์ค้างส่ง + toggle revert
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const rpc = vi.hoisted(() => vi.fn());
const photoQueueMock = vi.hoisted(() => ({
  enqueuePhoto: vi.fn(async () => {}),
  flushPhotos: vi.fn(async () => {}),
  pendingPhotoCount: vi.fn(async () => 0),
  failedPhotoCount: vi.fn(async () => 0),
  retryFailedPhotos: vi.fn(async () => 0),
}));

vi.mock('../lib/supabase', () => ({ supabase: () => ({ rpc }) }));
vi.mock('../lib/photoQueue', () => photoQueueMock);

import { MyWork } from './MyWork';

// template จริงจาก ITEMS ใน MyWork — item แรกของ inst_room_tech1 คือ 'เช็คพื้น'
const LANE = {
  task_id: 't-1',
  lane: 1,
  template_ref: 'inst_room_tech1',
  checklist_state: {} as Record<string, boolean>,
  room: 'ห้องนอนใหญ่',
  project: 'บ้านคุณเอ',
};

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'rpc_field_my_lanes') return { data: [{ ...LANE, checklist_state: {} }], error: null };
    return { data: null, error: null };
  });
});

describe('MyWork — แบนเนอร์ค้างส่ง + ปุ่ม "ลองส่งอีกครั้ง" (S18 Slice 1)', () => {
  it('มี failed items → แบนเนอร์โชว์ปุ่ม "ลองส่งอีกครั้ง" และกดแล้วเรียก retryFailedPhotos', async () => {
    photoQueueMock.pendingPhotoCount.mockResolvedValue(3);
    photoQueueMock.failedPhotoCount.mockResolvedValue(2);
    render(<MyWork />);
    expect(await screen.findByText(/ค้างส่ง 3 รายการ/)).toBeInTheDocument();
    const btn = await screen.findByRole('button', { name: /ลองส่งอีกครั้ง/ });
    fireEvent.click(btn);
    await waitFor(() => expect(photoQueueMock.retryFailedPhotos).toHaveBeenCalledTimes(1));
  });

  it('ไม่มี failed items → มีแบนเนอร์ค้างส่งแต่ไม่มีปุ่ม (ของยัง auto-retry อยู่)', async () => {
    photoQueueMock.pendingPhotoCount.mockResolvedValue(1);
    photoQueueMock.failedPhotoCount.mockResolvedValue(0);
    render(<MyWork />);
    expect(await screen.findByText(/ค้างส่ง 1 รายการ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ลองส่งอีกครั้ง/ })).not.toBeInTheDocument();
  });
});

describe('MyWork — checklist toggle revert เมื่อ RPC fail (S18 Slice 2)', () => {
  it('RPC ตอบ error → checkbox กลับสถานะเดิม + โชว์ "ยังไม่ได้บันทึก" โดยไม่ทิ้งทั้งจอ', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rpc_field_my_lanes') return { data: [{ ...LANE, checklist_state: {} }], error: null };
      if (fn === 'rpc_field_toggle_lane_item') return { data: null, error: { message: 'network down' } };
      return { data: null, error: null };
    });
    render(<MyWork />);
    const box = (await screen.findAllByRole('checkbox'))[0] as HTMLInputElement; // 'เช็คพื้น'
    expect(box.checked).toBe(false);
    fireEvent.click(box); // optimistic tick → RPC fail → ต้อง revert
    await waitFor(() => expect(box.checked).toBe(false));
    expect(screen.getByText(/ยังไม่ได้บันทึก/)).toBeInTheDocument();
    // จอห้องยังอยู่ครบ ไม่โดนแทนที่ด้วยหน้า error ทั้งจอ (ของเดิมทำแบบนั้น — ข้อมูลบริบทหาย)
    expect(screen.getByText(/บ้านคุณเอ/)).toBeInTheDocument();
  });

  it('RPC สำเร็จ → checkbox ติดค้างไว้ตามที่ติ๊ก ไม่มีคำเตือน', async () => {
    render(<MyWork />);
    const box = (await screen.findAllByRole('checkbox'))[0] as HTMLInputElement;
    fireEvent.click(box);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('rpc_field_toggle_lane_item', {
      p_task_id: 't-1', p_item: 'เช็คพื้น', p_done: true,
    }));
    expect(box.checked).toBe(true);
    expect(screen.queryByText(/ยังไม่ได้บันทึก/)).not.toBeInTheDocument();
  });
});
