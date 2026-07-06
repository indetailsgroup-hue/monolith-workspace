// Feature: installation-pm 1.8c (0098) — Flex message support ใน line-outbound-sender
// การ์ดตรวจรับลูกค้า (D-5): template message_kind='flex' → body JSON {"altText","contents"}
import { describe, it, expect } from "vitest";
import {
  buildOutboundMessage,
  renderOutboundText,
  buildLineRequest,
  type ClaimedOutbound,
} from "../../../supabase/functions/line-outbound-sender/index";

function flexRow(body: string, slots: Record<string, string>): ClaimedOutbound {
  return {
    outboundId: "ob-1",
    conversationId: null,
    sendType: "push",
    templateKey: "tpl_inst_approval_request",
    slotValues: slots,
    lineUserId: "Cg-customer-group",
    verticalContext: "monolith",
    channelAccessTokenRef: "vault-ref",
    candidateTemplates: [
      {
        templateKey: "tpl_inst_approval_request",
        verticalContext: null,
        body,
        isActive: true,
        messageKind: "flex",
      },
    ],
  };
}

describe("buildOutboundMessage — text vs flex (0098)", () => {
  it("text → LINE text message ตรงตัว", () => {
    const out = buildOutboundMessage("สวัสดีครับ", "text");
    expect(out).toEqual({ ok: true, message: { type: "text", text: "สวัสดีครับ" } });
  });

  it("flex ถูกรูปแบบ → LINE flex message (altText + contents)", () => {
    const body = JSON.stringify({
      altText: "ขอความกรุณาตรวจรับงานครับ",
      contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [] } },
    });
    const out = buildOutboundMessage(body, "flex");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.message.type).toBe("flex");
      if (out.message.type === "flex") {
        expect(out.message.altText).toBe("ขอความกรุณาตรวจรับงานครับ");
        expect(out.message.contents).toMatchObject({ type: "bubble" });
      }
    }
  });

  it("flex JSON พัง → failed (ไม่ส่งมั่ว)", () => {
    expect(buildOutboundMessage("not-json{{{", "flex")).toEqual({
      ok: false,
      reason: "flex_json_invalid",
    });
  });

  it("flex ขาด altText/contents → flex_shape_invalid", () => {
    expect(buildOutboundMessage(JSON.stringify({ contents: {} }), "flex").ok).toBe(false);
    expect(buildOutboundMessage(JSON.stringify({ altText: "x" }), "flex").ok).toBe(false);
  });
});

describe("renderOutboundText + buildLineRequest — เส้นทางการ์ดตรวจรับเต็ม (D-5)", () => {
  it("substitute slots ลงใน Flex JSON แล้ว build เป็น push request เข้ากลุ่ม", () => {
    const body = JSON.stringify({
      altText: "ตรวจรับงานที่ {{project_name}} ครับ",
      contents: {
        type: "bubble",
        footer: {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "button",
              action: {
                type: "postback",
                label: "รับงานครับ",
                data: '{"t":"inst_approval","id":"{{approval_id}}","k":"{{approve_token}}","d":"approve"}',
              },
            },
          ],
        },
      },
    });
    const row = flexRow(body, {
      project_name: "บ้านคุณสมชาย",
      approval_id: "appr-123",
      approve_token: "tok-456",
    });

    const rendered = renderOutboundText(row);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.kind).toBe("flex");

    const built = buildOutboundMessage(rendered.text, rendered.kind);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.message.type).toBe("flex");
    if (built.message.type !== "flex") return;
    expect(built.message.altText).toBe("ตรวจรับงานที่ บ้านคุณสมชาย ครับ");
    const data = JSON.stringify(built.message.contents);
    expect(data).toContain("appr-123");
    expect(data).toContain("tok-456");

    const request = buildLineRequest(row, built.message);
    expect(request.endpoint).toBe("push");
    if (request.endpoint === "push") {
      expect(request.to).toBe("Cg-customer-group"); // push เข้ากลุ่มด้วย groupId ตรง ๆ
      expect(request.messages[0].type).toBe("flex");
    }
  });

  it("template ไม่ระบุ messageKind → default text (แถวเดิมทั้งระบบพฤติกรรมคงเดิม)", () => {
    const row: ClaimedOutbound = {
      ...flexRow("สวัสดี {{name}}", { name: "ครับ" }),
      candidateTemplates: [
        { templateKey: "tpl_inst_approval_request", verticalContext: null, body: "สวัสดี {{name}}", isActive: true },
      ],
    };
    const rendered = renderOutboundText(row);
    expect(rendered.ok).toBe(true);
    if (rendered.ok) expect(rendered.kind).toBe("text");
  });
});
