import { deepFreeze } from "./line-flex-model.mjs";

export const PRESET_IDS = deepFreeze([
  "design-approval", "quote-order", "sla-escalation", "site-update", "issue-evidence"
]);

const sharedContext = {
  version: 1,
  tenantId: "tenant_daph_demo",
  tenantName: "Daph Studio",
  platformMark: "Secured by MONOLITH",
  demoStatus: "standalone_demo",
  recipientRef: "customer_demo_001"
};

const makePreset = ({
  id, audience, asset, canonicalAction, risk, requestedActionType,
  targetRef, expiresInMinutes, correlationPrefix, description, reviewToken, th, en
}) => ({
  id,
  base: {
    ...(reviewToken === undefined ? {} : { reviewToken }),
    context: { ...sharedContext, audience },
    hero: {
      localAsset: "./assets/line-flex-studio/" + asset,
      exportUrl: "https://example.com/monolith/" + asset.replace(".svg", ".png"),
      aspectRatio: "20:13",
      aspectMode: "cover",
      description
    },
    intent: {
      canonicalAction, risk, requestedActionType, targetRef, expiresInMinutes
    },
    evidence: { correlationPrefix }
  },
  copy: { th, en }
});

const entries = [
  makePreset({
    id: "design-approval",
    audience: "customer",
    asset: "design-approval-hero.svg",
    canonicalAction: "design.approve_revision",
    risk: "high",
    requestedActionType: "liff_uri",
    targetRef: "project_s49_main_kitchen",
    expiresInMinutes: 1440,
    correlationPrefix: "LFS-APPROVAL",
    description: "Warm kitchen design preview",
    reviewToken: "rvw_A1_7L3n9Q2pV8xK",
    th: {
      header: { eyebrow: "DAPH STUDIO", title: "แบบพร้อมอนุมัติ", status: "REV D-07" },
      body: {
        project: "บ้านสุขุมวิท 49 · ครัวหลัก", revision: "D-07",
        requester: "พิม · Senior Designer", amount: "฿486,000",
        deadline: "3 ส.ค. 2026 · 18:00",
        summary: "ตรวจ revision และผลกระทบก่อนยืนยัน",
        trustNote: "ระบบจะไม่เปลี่ยนสถานะจนกว่าคุณยืนยันในพื้นที่ส่วนตัว"
      },
      footer: { primaryLabel: "เปิดดูแบบและยืนยัน", secondaryLabel: "" },
      altText: "แบบครัว revision D-07 พร้อมให้ตรวจและยืนยัน"
    },
    en: {
      header: { eyebrow: "DAPH STUDIO", title: "Design ready for review", status: "REV D-07" },
      body: {
        project: "Sukhumvit 49 Residence · Main Kitchen", revision: "D-07",
        requester: "Pim · Senior Designer", amount: "THB 486,000",
        deadline: "3 Aug 2026 · 18:00",
        summary: "Review the revision and consequences before confirming",
        trustNote: "No business state changes until you confirm in the private review"
      },
      footer: { primaryLabel: "Review and confirm", secondaryLabel: "" },
      altText: "Kitchen design revision D-07 is ready for review"
    }
  }),
  makePreset({
    id: "quote-order",
    audience: "customer",
    asset: "quote-order-hero.svg",
    canonicalAction: "commerce.submit_order_intent",
    risk: "high",
    requestedActionType: "liff_uri",
    targetRef: "quote_q-2026-081",
    expiresInMinutes: 2880,
    correlationPrefix: "LFS-ORDER",
    description: "Material cards and quote document",
    th: {
      header: { eyebrow: "DAPH STUDIO", title: "ใบเสนอราคาพร้อมตรวจ", status: "QUOTE Q-2026-081" },
      body: {
        project: "บ้านสุขุมวิท 49 · Built-in package", revision: "Q-03",
        requester: "เมย์ · Sales Consultant", amount: "฿1,280,000",
        deadline: "5 ส.ค. 2026 · 18:00",
        summary: "ตรวจราคา ขอบเขต ตัวเลือก และเงื่อนไขก่อนส่งคำสั่งซื้อ",
        trustNote: "ข้อความในแชตไม่ถือเป็น order จนกว่าคุณยืนยันข้อมูลแบบมีโครงสร้าง"
      },
      footer: { primaryLabel: "ตรวจราคาและสั่งซื้อ", secondaryLabel: "ให้ Sale ติดต่อ" },
      altText: "ใบเสนอราคา Q-2026-081 พร้อมให้ตรวจ"
    },
    en: {
      header: { eyebrow: "DAPH STUDIO", title: "Quote ready for review", status: "QUOTE Q-2026-081" },
      body: {
        project: "Sukhumvit 49 Residence · Built-in package", revision: "Q-03",
        requester: "May · Sales Consultant", amount: "THB 1,280,000",
        deadline: "5 Aug 2026 · 18:00",
        summary: "Review price, scope, options and terms before submitting an order",
        trustNote: "Chat text is not an order until structured details are confirmed"
      },
      footer: { primaryLabel: "Review quote and order", secondaryLabel: "Ask Sales to contact me" },
      altText: "Quote Q-2026-081 is ready for review"
    }
  }),
  makePreset({
    id: "sla-escalation",
    audience: "internal",
    asset: "sla-escalation-hero.svg",
    canonicalAction: "workflow.acknowledge_sla",
    risk: "low",
    requestedActionType: "postback",
    targetRef: "work_item_314",
    expiresInMinutes: 240,
    correlationPrefix: "LFS-SLA",
    description: "Calm SLA clock and workflow lane",
    th: {
      header: { eyebrow: "MONOLITH · DAPH STUDIO", title: "งานใกล้เกิน SLA", status: "47 นาที" },
      body: {
        project: "งาน #314 · อนุมัติสั่งฮาร์ดแวร์", revision: "WORK-314",
        requester: "Procurement Queue", amount: "วงเงิน ฿32,800",
        deadline: "วันนี้ · 21:00",
        summary: "รับทราบได้จากการ์ด; การอนุมัติวงเงินต้องเปิดงานและยืนยันสิทธิ์",
        trustNote: "Acknowledgement ไม่เปลี่ยน workflow state"
      },
      footer: { primaryLabel: "รับทราบ SLA", secondaryLabel: "เปิดงาน" },
      altText: "งาน 314 เหลือ 47 นาทีก่อนเกิน SLA"
    },
    en: {
      header: { eyebrow: "MONOLITH · DAPH STUDIO", title: "Work item nearing SLA", status: "47 MIN" },
      body: {
        project: "Work #314 · Hardware purchase approval", revision: "WORK-314",
        requester: "Procurement Queue", amount: "Limit THB 32,800",
        deadline: "Today · 21:00",
        summary: "Acknowledge here; open the work item to approve the amount",
        trustNote: "Acknowledgement does not change workflow state"
      },
      footer: { primaryLabel: "Acknowledge SLA", secondaryLabel: "Open work item" },
      altText: "Work item 314 has 47 minutes before SLA breach"
    }
  }),
  makePreset({
    id: "site-update",
    audience: "customer_group",
    asset: "site-update-hero.svg",
    canonicalAction: "field.view_curated_update",
    risk: "low",
    requestedActionType: "uri",
    targetRef: "site_update_2026-08-01",
    expiresInMinutes: 10080,
    correlationPrefix: "LFS-SITE",
    description: "Curated site progress frames",
    th: {
      header: { eyebrow: "DAPH STUDIO", title: "อัปเดตหน้างานที่คัดแล้ว", status: "68% COMPLETE" },
      body: {
        project: "บ้านสุขุมวิท 49 · ชั้น 1", revision: "SITE-2026-08-01",
        requester: "นัท · Site Lead", amount: "เสร็จ 11 จาก 16 เลน",
        deadline: "อัปเดตถัดไป 2 ส.ค. · 17:00",
        summary: "รูปชุดนี้ผ่านการคัดสำหรับกลุ่มลูกค้าแล้ว",
        trustNote: "ระบบไม่ส่งต่อรูปจากกลุ่มทีมโดยอัตโนมัติ"
      },
      footer: { primaryLabel: "ดูความคืบหน้าที่คัดแล้ว", secondaryLabel: "" },
      altText: "อัปเดตหน้างานชั้น 1 ที่คัดแล้ว เสร็จ 68 เปอร์เซ็นต์"
    },
    en: {
      header: { eyebrow: "DAPH STUDIO", title: "Curated site update", status: "68% COMPLETE" },
      body: {
        project: "Sukhumvit 49 Residence · Level 1", revision: "SITE-2026-08-01",
        requester: "Nut · Site Lead", amount: "11 of 16 lanes complete",
        deadline: "Next update 2 Aug · 17:00",
        summary: "This evidence set has been curated for the customer group",
        trustNote: "Internal team photos are never forwarded automatically"
      },
      footer: { primaryLabel: "View curated progress", secondaryLabel: "" },
      altText: "Curated Level 1 site update, 68 percent complete"
    }
  }),
  makePreset({
    id: "issue-evidence",
    audience: "internal_group",
    asset: "issue-evidence-hero.svg",
    canonicalAction: "evidence.acknowledge_issue",
    risk: "low",
    requestedActionType: "postback",
    targetRef: "issue_042",
    expiresInMinutes: 1440,
    correlationPrefix: "LFS-ISSUE",
    description: "Evidence frame and quarantine boundary",
    th: {
      header: { eyebrow: "MONOLITH · DAPH STUDIO", title: "รับหลักฐานปัญหาแล้ว", status: "QUARANTINE" },
      body: {
        project: "บ้านสุขุมวิท 49 · ห้องครัว", revision: "ISS-042",
        requester: "LINE Group · ผู้ส่งยังไม่ผูกตัวตน", amount: "ระดับ P2 · รอตรวจ",
        deadline: "Review ภายใน 2 ชม.",
        summary: "รูปถูกเก็บพร้อม source และ provenance แต่ยังไม่เปลี่ยน workflow",
        trustNote: "มนุษย์ต้อง promote หรือ reject หลังยืนยัน actor และ project"
      },
      footer: { primaryLabel: "รับเรื่องและเปิดคิวตรวจ", secondaryLabel: "" },
      altText: "หลักฐานปัญหา ISS-042 อยู่ใน quarantine รอตรวจ"
    },
    en: {
      header: { eyebrow: "MONOLITH · DAPH STUDIO", title: "Issue evidence received", status: "QUARANTINE" },
      body: {
        project: "Sukhumvit 49 Residence · Kitchen", revision: "ISS-042",
        requester: "LINE Group · Unbound sender", amount: "P2 · Review required",
        deadline: "Review within 2 hours",
        summary: "Evidence is stored with provenance but has not changed workflow",
        trustNote: "A human must promote or reject after actor and project verification"
      },
      footer: { primaryLabel: "Acknowledge and review", secondaryLabel: "" },
      altText: "Issue evidence ISS-042 is quarantined for review"
    }
  })
];

export const PRESETS = deepFreeze(Object.fromEntries(entries.map((item) => [item.id, item])));

export function getPreset(id) {
  const preset = PRESETS[id];
  if (!preset) throw new Error("unknown_preset");
  return preset;
}
