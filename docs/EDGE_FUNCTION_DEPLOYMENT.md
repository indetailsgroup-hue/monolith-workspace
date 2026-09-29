# Edge Function Deployment Guide — MONOLITH

## Overview

The `generate-quotation-pdf` Edge Function generates bilingual Thai/English quotation PDFs
with Buddhist Era dates, Thai Baht formatting, and numberToThaiText conversion.

---

## Prerequisites

```bash
# Install Supabase CLI
npm install -g supabase

# Install Vercel CLI
npm install -g vercel

# Link your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Link your Vercel project
vercel link
```

---

## Environment Variables

### Required in `.env.local` (development)
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key
SUPABASE_PROJECT_REF=your-project-ref
```

### Required in Vercel (production)
| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |

Set via: **Vercel Dashboard → Settings → Environment Variables**
Or via CLI: `vercel env add VITE_SUPABASE_URL production`

---

## Deployment

### Automated (recommended)
```bash
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_PROJECT_REF=your-project-ref
export VITE_SUPABASE_URL=$SUPABASE_URL
export VITE_SUPABASE_ANON_KEY=your-anon-key

./scripts/deploy-edge-functions.sh --env production
```

### Manual
```bash
# 1. Deploy the Edge Function
supabase functions deploy generate-quotation-pdf --no-verify-jwt

# 2. Add Vercel env vars
echo "https://YOUR_PROJECT.supabase.co" | vercel env add VITE_SUPABASE_URL production
echo "your-anon-key" | vercel env add VITE_SUPABASE_ANON_KEY production

# 3. Redeploy Vercel
vercel --prod
```

---

## Testing

### Local testing
```bash
supabase functions serve generate-quotation-pdf --env-file .env.local
```

Then POST to `http://localhost:54321/functions/v1/generate-quotation-pdf`:
```json
{
  "quotationId": "test-123",
  "items": [
    { "name": "แผ่น ACP 4mm", "qty": 10, "unit": "แผ่น", "unitPrice": 1500, "total": 15000 }
  ],
  "customer": { "name": "ลูกค้าทดสอบ", "address": "กรุงเทพ" },
  "discount": 0,
  "vat": 7,
  "validDays": 30
}
```

### Production verification
```bash
curl -X POST \
  "https://YOUR_PROJECT.supabase.co/functions/v1/generate-quotation-pdf" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"quotationId":"test"}' \
  -o test-output.pdf
```

---

## Architecture

```
Client (QuotationBuilder)
    ↓ useQuotationPdfExport.ts
    ↓ POST /functions/v1/generate-quotation-pdf
    ↓
Supabase Edge Function (Deno)
    → Thai locale formatting (numberToThaiText, Buddhist Era)
    → PDF generation (returns application/pdf)
    ↓
Client receives PDF blob → triggers download
    (fallback: local jsPDF generation if Edge Function fails)
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check `VITE_SUPABASE_ANON_KEY` is correct |
| 404 Not Found | Function not deployed; run `supabase functions deploy` |
| CORS error | `--no-verify-jwt` flag already handles this; check Supabase CORS settings |
| Thai text garbled | Ensure PDF viewer supports Unicode; the function uses embedded fonts |
| Vercel env not updating | Run `vercel --prod` to trigger a fresh deployment |
