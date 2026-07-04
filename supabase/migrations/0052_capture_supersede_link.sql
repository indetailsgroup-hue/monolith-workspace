-- Migration: capture_supersede_link — capture-spine Phase 2 (scrutinize Wave 0, fix J1)
-- Depends on: 0049_capture_init.sql
--
-- J1 (MEDIUM): Req 5.4 "การแก้ = artifact ใหม่ + supersede" (non-destructive versioning) + terminal immutability (Property 6)
--   แต่ capture_artifact ไม่มี link ระหว่าง artifact ใหม่ ↔ ตัวที่มันแทนที่ → superseded เป็น orphan status, trace chain ไม่ได้.
--   แก้: เพิ่ม supersedes_id (artifact ใหม่ชี้กลับตัวที่มัน supersede) — additive, nullable. ค้นตัวแทนที่: WHERE supersedes_id = <old>.
--   partial unique: artifact หนึ่งตัวถูก supersede ได้ครั้งเดียว (กัน fork chain).

alter table public.capture_artifact
  add column if not exists supersedes_id uuid references public.capture_artifact (id);

comment on column public.capture_artifact.supersedes_id is
  'artifact ที่ record นี้มาแทนที่ (non-destructive supersede, Req 5.4/Property 6); NULL = ต้นฉบับ';

-- artifact เดิมหนึ่งตัวถูกแทนที่ได้ครั้งเดียว (one supersede chain, ไม่ fork)
create unique index if not exists ux_capture_artifact_supersedes
  on public.capture_artifact (supersedes_id)
  where supersedes_id is not null;
