// คิวรูปออฟไลน์ — เสียบ spike 0.3 (src/installation/offline-queue) ตรง ๆ (task 1.7)
// SubmitFn: upload Storage → rpc_field_submit_photo (duplicate-tolerant — สัญญา S3)
import { OfflineQueue } from '../../../../src/installation/offline-queue/queue';
import { IdbQueueStorage } from '../../../../src/installation/offline-queue/idb-storage';
import { bindForegroundFlush } from '../../../../src/installation/offline-queue/sw-bridge';
import type { QueueItem } from '../../../../src/installation/offline-queue/types';
import { supabase } from './supabase';

interface PhotoPayload { taskId: string; blob: Blob; contentType: string }

const queue = new OfflineQueue(new IdbQueueStorage());

async function submit(item: QueueItem): Promise<void> {
  const p = item.payload as PhotoPayload;
  const path = `field/${p.taskId}/${item.submissionId}.jpg`;
  const up = await supabase().storage.from('installation-media')
    .upload(path, p.blob, { contentType: p.contentType, upsert: true }); // upsert = retry เขียนทับ path เดิม
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase().rpc('rpc_field_submit_photo', {
    p_task_id: p.taskId, p_storage_path: path, p_client_submission_id: item.submissionId,
  });
  if (error) throw new Error(error.message);
}

export async function enqueuePhoto(taskId: string, file: File): Promise<void> {
  await queue.enqueue({ kind: 'photo', payload: { taskId, blob: file, contentType: file.type || 'image/jpeg' } });
  void flushPhotos();
}

export async function flushPhotos(): Promise<void> {
  if (!navigator.onLine) return;
  await queue.flush(submit);
}

export function pendingPhotoCount(): Promise<number> {
  return queue.pendingCount();
}

// flush ตอนเน็ตกลับ/แอปกลับมา visible (กลยุทธ์ foreground — sw-bridge spike 0.3)
bindForegroundFlush(window, document, () => void flushPhotos());
