import { selectActionMode } from "./line-flex-actions.mjs";

const actionFor = (draft) => {
  const mode = selectActionMode(draft.intent);
  if (mode === "postback") {
    return { type: "postback", label: draft.footer.primaryLabel,
      data: "intent=" + encodeURIComponent(draft.presetId) };
  }
  if (mode === "message") {
    return { type: "message", label: draft.footer.primaryLabel,
      text: draft.footer.primaryLabel };
  }
  const reviewToken = draft.presetId === "design-approval"
    ? "?reviewToken=" + encodeURIComponent(draft.reviewToken)
    : "";
  return { type: "uri", label: draft.footer.primaryLabel,
    uri: "https://example.com/monolith/demo/" + encodeURIComponent(draft.presetId) +
      reviewToken };
};

const factRow = (label, value) => ({
  type: "box",
  layout: "horizontal",
  contents: [
    { type: "text", text: label, size: "sm", color: "#667871", flex: 2 },
    { type: "text", text: value, size: "sm", color: "#173B35",
      weight: "bold", wrap: true, align: "end", flex: 3 }
  ]
});

export function buildFlexMessage(draft) {
  return {
    type: "flex",
    altText: draft.altText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: draft.header.eyebrow, size: "xs", color: "#69817B" },
          { type: "text", text: draft.header.title, weight: "bold", size: "lg", wrap: true },
          { type: "text", text: draft.header.status, size: "xs", color: "#0E6B5B" }
        ]
      },
      hero: {
        type: "image",
        url: draft.hero.exportUrl,
        size: "full",
        aspectRatio: draft.hero.aspectRatio,
        aspectMode: draft.hero.aspectMode
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: draft.body.project, weight: "bold", size: "xl", wrap: true },
          factRow(draft.language === "th" ? "Revision" : "Revision", draft.body.revision),
          factRow(draft.language === "th" ? "ผู้ส่ง" : "Requested by", draft.body.requester),
          factRow(draft.language === "th" ? "มูลค่า/ขอบเขต" : "Amount / scope", draft.body.amount),
          factRow(draft.language === "th" ? "ภายใน" : "Due", draft.body.deadline),
          { type: "text", text: draft.body.summary, wrap: true, color: "#526862" },
          { type: "text", text: draft.body.trustNote, wrap: true, size: "xs", color: "#756743" }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: "#0E6B5B", action: actionFor(draft) }
        ]
      }
    }
  };
}

export function measureUtf8Bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
