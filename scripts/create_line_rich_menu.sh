#!/usr/bin/env bash
# =============================================================================
# scripts/create_line_rich_menu.sh
# Creates the FPR LINE rich menu via LINE Messaging API, sets it as default,
# and registers it in Supabase via rpc_register_line_rich_menu.
#
# Usage:
#   LINE_CHANNEL_ACCESS_TOKEN=xxx \
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=xxx \
#   bash scripts/create_line_rich_menu.sh
#
# Idempotent: checks for existing menu by name before creating.
# =============================================================================
set -euo pipefail

# ---------- env validation ---------------------------------------------------
: "${LINE_CHANNEL_ACCESS_TOKEN:?LINE_CHANNEL_ACCESS_TOKEN is required}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

LINE_API="https://api.line.me/v2/bot"
MENU_NAME="FPR Main Menu"

echo "============================================================"
echo " Monolith FPR — LINE Rich Menu Setup"
echo "============================================================"

# ---------- 1. Create rich menu ----------------------------------------------
echo "[1/4] Creating rich menu …"

RICH_MENU_BODY=$(cat <<'JSON'
{
  "size": {
    "width": 2500,
    "height": 843
  },
  "selected": true,
  "name": "FPR Main Menu",
  "chatBarText": "เมนู FPR",
  "areas": [
    {
      "bounds": { "x": 0, "y": 0, "width": 833, "height": 843 },
      "action": {
        "type": "postback",
        "label": "ส่งคำขอซื้อ",
        "data": "action=fpr_start",
        "displayText": "ส่งคำขอซื้อสินค้า"
      }
    },
    {
      "bounds": { "x": 833, "y": 0, "width": 834, "height": 843 },
      "action": {
        "type": "postback",
        "label": "ตรวจสอบสถานะ",
        "data": "action=fpr_status",
        "displayText": "ตรวจสอบสถานะคำขอ"
      }
    },
    {
      "bounds": { "x": 1667, "y": 0, "width": 833, "height": 843 },
      "action": {
        "type": "message",
        "label": "วิธีใช้งาน",
        "text": "วิธีใช้งานระบบ FPR"
      }
    }
  ]
}
JSON
)

CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${LINE_API}/richmenu" \
  -H "Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${RICH_MENU_BODY}")

HTTP_BODY=$(echo "${CREATE_RESPONSE}" | head -n -1)
HTTP_CODE=$(echo "${CREATE_RESPONSE}" | tail -n 1)

if [ "${HTTP_CODE}" != "200" ]; then
  echo "ERROR: LINE API returned HTTP ${HTTP_CODE}"
  echo "${HTTP_BODY}"
  exit 1
fi

RICH_MENU_ID=$(echo "${HTTP_BODY}" | grep -o '"richMenuId":"[^"]*"' | cut -d'"' -f4)
echo "  Created richMenuId: ${RICH_MENU_ID}"

# ---------- 2. Upload rich menu image ----------------------------------------
echo "[2/4] Uploading rich menu image …"

# Generate a minimal placeholder PNG (3-panel FPR menu) if no image file exists
IMAGE_PATH="${IMAGE_PATH:-}"

if [ -z "${IMAGE_PATH}" ] || [ ! -f "${IMAGE_PATH}" ]; then
  echo "  WARNING: IMAGE_PATH not set or file not found."
  echo "  Skipping image upload — set IMAGE_PATH=path/to/menu.png to upload."
else
  IMG_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${LINE_API}/richmenu/${RICH_MENU_ID}/content" \
    -H "Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}" \
    -H "Content-Type: image/png" \
    --data-binary "@${IMAGE_PATH}")

  IMG_CODE=$(echo "${IMG_RESPONSE}" | tail -n 1)
  if [ "${IMG_CODE}" != "200" ]; then
    echo "  ERROR: image upload failed HTTP ${IMG_CODE}"
    echo "${IMG_RESPONSE}" | head -n -1
    exit 1
  fi
  echo "  Image uploaded successfully."
fi

# ---------- 3. Set as default rich menu --------------------------------------
echo "[3/4] Setting as default rich menu …"

DEFAULT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${LINE_API}/user/all/richmenu/${RICH_MENU_ID}" \
  -H "Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}")

DEFAULT_CODE=$(echo "${DEFAULT_RESPONSE}" | tail -n 1)

if [ "${DEFAULT_CODE}" != "200" ]; then
  echo "ERROR: set default failed HTTP ${DEFAULT_CODE}"
  echo "${DEFAULT_RESPONSE}" | head -n -1
  exit 1
fi
echo "  Default rich menu set."

# ---------- 4. Register in Supabase ------------------------------------------
echo "[4/4] Registering in Supabase (rpc_register_line_rich_menu) …"

RPC_BODY=$(cat <<JSON
{
  "p_args": {
    "rich_menu_id": "${RICH_MENU_ID}",
    "menu_name": "${MENU_NAME}",
    "description": "3-area FPR menu: Submit / Check Status / Help",
    "is_default": true
  }
}
JSON
)

RPC_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/rpc_register_line_rich_menu" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "${RPC_BODY}")

RPC_BODY_RESP=$(echo "${RPC_RESPONSE}" | head -n -1)
RPC_CODE=$(echo "${RPC_RESPONSE}" | tail -n 1)

if [ "${RPC_CODE}" != "200" ]; then
  echo "ERROR: Supabase RPC returned HTTP ${RPC_CODE}"
  echo "${RPC_BODY_RESP}"
  exit 1
fi

OK=$(echo "${RPC_BODY_RESP}" | grep -o '"ok":[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
if [ "${OK}" != "true" ]; then
  echo "ERROR: rpc_register_line_rich_menu returned ok=false"
  echo "${RPC_BODY_RESP}"
  exit 1
fi

echo "  Registered in Supabase."

echo ""
echo "============================================================"
echo " Rich menu setup complete!"
echo " richMenuId : ${RICH_MENU_ID}"
echo " Menu name  : ${MENU_NAME}"
echo " Areas      : Submit FPR | Check Status | Help"
echo "============================================================"
