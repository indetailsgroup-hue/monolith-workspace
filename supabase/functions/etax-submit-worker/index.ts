/**
 * supabase/functions/etax-submit-worker/index.ts
 *
 * e-Tax Submit Worker — polls etax_submissions (status='queued'),
 * generates Thai RD UBL 2.1 XML (T01 / InvoiceTypeCode 388),
 * POSTs to an ETDA-certified provider, marks each submission
 * submitted or failed, then inline-downloads the resulting PDF
 * from the provider and stores it in Supabase Storage (etax-pdfs).
 *
 * Env vars required:
 *   SUPABASE_URL            — injected automatically by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically
 *   ETAX_PROVIDER_URL       — ETDA-certified provider endpoint
 *   ETAX_API_KEY            — provider API key
 *   ETAX_SELLER_TAX_ID      — 13-digit Thai tax-ID of the platform seller
 *   ETAX_SELLER_NAME        — Thai legal name of the platform seller
 *   CRON_SECRET             — shared secret for Supabase Scheduled Job auth
 *
 * Trigger: Supabase Scheduled Job every 5 minutes
 *   POST https://<project>.supabase.co/functions/v1/etax-submit-worker
 *   Authorization: Bearer <CRON_SECRET>
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_LIMIT   = 10
const UBL_NAMESPACE = 'urn:etax:names:specification:ubl:schema:xsd:TaxInvoice-1'
const UBL_CAC       = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'
const UBL_CBC       = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
const UBL_EXT       = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'

const PDF_FETCH_TIMEOUT_MS = 30_000
const PDF_BUCKET           = 'etax-pdfs'

// ─── Types ───────────────────────────────────────────────────────────────────

interface EtaxSubmission {
  id:              string
  org_id:          string
  invoice_id:      string
  document_type:   'T01' | 'T02' | 'T03' | 'T04'
  document_number: string
  document_date:   string        // ISO date string
  net_amount:      number
  vat_amount:      number
  gross_amount:    number
  vat_rate:        number        // e.g. 0.07
  seller_tax_id:   string
  buyer_tax_id:    string | null
  buyer_name:      string | null
  status:          string
  attempt_count:   number
  xml_payload:     string | null
}

interface InvoiceDetail {
  invoice_number:   string
  customer_name:    string
  customer_tax_id:  string | null
  due_date:         string | null
  total_amount:     number
  notes:            string | null
}

interface ProviderResponse {
  success:           boolean
  rd_ref_no?:        string
  rd_response_code?: string
  error?:            string
}

interface WorkerResult {
  processed: number
  submitted: number
  failed:    number
  pdf_ok:    number        // NEW: count of PDFs successfully downloaded
  pdf_fail:  number        // NEW: count of PDFs that failed (non-fatal)
  errors:    Array<{ id: string; error: string }>
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function xmlEscape(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function fmt(n: number): string { return n.toFixed(2) }
function fmtDate(d: string): string { return d.slice(0, 10) }

function getInvoiceTypeCode(docType: string): { code: string; name: string } {
  const map: Record<string, { code: string; name: string }> = {
    T01: { code: '388', name: 'T01' },
    T02: { code: '388', name: 'T02' },
    T03: { code: '381', name: 'T03' },
    T04: { code: '383', name: 'T04' },
  }
  return map[docType] ?? { code: '388', name: 'T01' }
}

// ─── UBL XML generator ────────────────────────────────────────────────────────

function buildUblXml(
  submission: EtaxSubmission,
  sellerTaxId: string,
  sellerName: string,
  invoice: InvoiceDetail,
): string {
  const now = new Date()
  const issueDate = fmtDate(submission.document_date)
  const issueTime = now.toISOString().slice(11, 19)
  const { code: typeCode, name: typeName } = getInvoiceTypeCode(submission.document_type)

  const buyerTaxId    = submission.buyer_tax_id ?? invoice.customer_tax_id ?? '0000000000000'
  const buyerName     = xmlEscape(submission.buyer_name ?? invoice.customer_name ?? 'ไม่ระบุ')
  const sellerEscaped = xmlEscape(sellerName)
  const docNumber     = xmlEscape(submission.document_number)
  const netAmt        = fmt(submission.net_amount)
  const vatAmt        = fmt(submission.vat_amount)
  const grossAmt      = fmt(submission.gross_amount)
  const vatPct        = fmt(submission.vat_rate * 100)

  return `<?xml version="1.0" encoding="UTF-8"?>
<TaxInvoice xmlns="${UBL_NAMESPACE}"
            xmlns:cac="${UBL_CAC}"
            xmlns:cbc="${UBL_CBC}"
            xmlns:ext="${UBL_EXT}">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:etax:names:specification:ubl:thailand:codelist:gc:TaxInvoiceCode:3.0</cbc:CustomizationID>
  <cbc:ProfileID>tax:invoice:type:${typeCode}</cbc:ProfileID>
  <cbc:ID>${docNumber}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${typeName}">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>THB</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>THB</cbc:TaxCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID schemeID="TXID">${xmlEscape(sellerTaxId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${sellerEscaped}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID schemeID="TXID">${xmlEscape(buyerTaxId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${buyerName}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="THB">${vatAmt}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="THB">${netAmt}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="THB">${vatAmt}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>VAT</cbc:ID>
        <cbc:Percent>${vatPct}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="THB">${netAmt}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="THB">${netAmt}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="THB">${grossAmt}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="THB">${grossAmt}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="THB">${netAmt}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>${xmlEscape(invoice.notes ?? 'สินค้า/บริการ')}</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="THB">${netAmt}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</TaxInvoice>`
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function claimBatch(
  supabase: SupabaseClient,
  limit: number,
): Promise<EtaxSubmission[]> {
  const { data, error } = await supabase.rpc('_etax_claim_batch', { p_limit: limit })
  if (error) throw new Error(`claimBatch rpc error: ${error.message}`)
  return (data as EtaxSubmission[]) ?? []
}

async function fetchInvoiceDetail(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number, customer_name, customer_tax_id, due_date, total_amount, notes')
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) return null
  return data as InvoiceDetail | null
}

async function markSubmitted(
  supabase: SupabaseClient,
  id: string,
  rdRefNo: string,
  rdResponseCode: string,
  xmlPayload: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_etax_mark_submitted', {
    p_submission_id:   id,
    p_rd_ref_no:       rdRefNo,
    p_rd_response_code: rdResponseCode,
    p_xml_payload:     xmlPayload,
  })
  if (error) throw new Error(`markSubmitted error: ${error.message}`)
}

async function markFailed(
  supabase: SupabaseClient,
  id: string,
  errorDetail: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_etax_mark_failed', {
    p_submission_id: id,
    p_error_detail:  errorDetail,
  })
  if (error) console.error(`markFailed error: ${error.message}`)
}

// ─── PDF download helper (NEW in 0183) ────────────────────────────────────────

/**
 * downloadAndStorePdf
 *
 * Called immediately after a successful submission. Downloads the PDF from the
 * ETDA-certified provider (GET /documents/{rdRefNo}/pdf), uploads it to the
 * private Supabase Storage bucket `etax-pdfs`, and calls
 * `rpc_etax_mark_pdf_downloaded` to persist the storage path.
 *
 * This step is NON-FATAL: a PDF failure never rolls back the submission.
 * The trigger `trg_queue_pdf_on_submitted` already set pdf_status='pending'
 * when the submission transitioned to 'submitted', so a failed inline attempt
 * simply records the error and leaves pdf_status='failed' for the retry worker.
 *
 * Returns true on success, false on any failure.
 */
async function downloadAndStorePdf(
  supabase: SupabaseClient,
  submission: EtaxSubmission,
  rdRefNo: string,
  providerUrl: string,
  apiKey: string,
): Promise<boolean> {
  const logPrefix = `[etax-pdf][${submission.id}]`

  try {
    // ── 1. Build provider PDF URL ──────────────────────────────────────────
    // Most Thai ETDA providers expose: GET /v1/documents/{rdRefNo}/pdf
    const pdfEndpoint = `${providerUrl.replace(/\/$/, '')}/v1/documents/${encodeURIComponent(rdRefNo)}/pdf`

    const pdfResponse = await fetch(pdfEndpoint, {
      method: 'GET',
      headers: {
        'X-API-Key':   apiKey,
        'Accept':      'application/pdf',
      },
      signal: AbortSignal.timeout(PDF_FETCH_TIMEOUT_MS),
    })

    if (!pdfResponse.ok) {
      const body = await pdfResponse.text().catch(() => '')
      throw new Error(`PDF endpoint HTTP ${pdfResponse.status}: ${body.slice(0, 200)}`)
    }

    const contentType = pdfResponse.headers.get('content-type') ?? ''
    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      throw new Error(`Unexpected content-type from PDF endpoint: ${contentType}`)
    }

    // ── 2. Read PDF bytes ──────────────────────────────────────────────────
    const pdfBuffer  = await pdfResponse.arrayBuffer()
    const pdfBytes   = new Uint8Array(pdfBuffer)

    if (pdfBytes.length === 0) {
      throw new Error('Provider returned empty PDF body')
    }

    // ── 3. Build storage path ──────────────────────────────────────────────
    // Format: {org_id}/{YYYY}/{submission_id}.pdf
    // e.g.  : 550e8400-e29b-41d4-a716.../2026/7f3a91b2-....pdf
    const year        = new Date(submission.document_date).getFullYear()
    const storagePath = `${submission.org_id}/${year}/${submission.id}.pdf`

    // ── 4. Upload to Supabase Storage ─────────────────────────────────────
    const { error: uploadError } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert:      true,          // idempotent re-run safe
        cacheControl: '31536000',   // 1 year — PDFs are immutable
      })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    // ── 5. Mark PDF as downloaded in the DB ───────────────────────────────
    const { error: markError } = await supabase.rpc('rpc_etax_mark_pdf_downloaded', {
      p_id:   submission.id,
      p_path: storagePath,
    })

    if (markError) {
      // Storage upload succeeded but DB update failed — log and treat as failure
      // so the retry worker can reconcile. The PDF is already in storage.
      throw new Error(`rpc_etax_mark_pdf_downloaded error: ${markError.message}`)
    }

    console.log(`${logPrefix} ✅ PDF stored: ${storagePath} (${pdfBytes.length} bytes)`)
    return true

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(`${logPrefix} ⚠️  PDF download failed (non-fatal): ${errMsg}`)

    // Mark PDF as failed — leaves a clear error for debugging / retry.
    // The trigger already set pdf_status='pending' when submission became 'submitted';
    // rpc_etax_mark_pdf_failed will move it to 'failed'.
    const { error: failError } = await supabase.rpc('rpc_etax_mark_pdf_failed', {
      p_id:    submission.id,
      p_error: errMsg,
    })
    if (failError) {
      console.error(`${logPrefix} rpc_etax_mark_pdf_failed error: ${failError.message}`)
    }

    return false
  }
}

// ─── Provider API ─────────────────────────────────────────────────────────────

async function submitToProvider(
  providerUrl: string,
  apiKey: string,
  xmlPayload: string,
  documentNumber: string,
  documentType: string,
): Promise<ProviderResponse> {
  const endpoint = `${providerUrl.replace(/\/$/, '')}/v1/submit`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/xml; charset=UTF-8',
      'X-API-Key':        apiKey,
      'X-Document-Number': documentNumber,
      'X-Document-Type':  documentType,
      Accept:             'application/json',
    },
    body:   xmlPayload,
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return { success: false, error: `HTTP ${response.status}: ${body.slice(0, 300)}` }
  }

  let json: Record<string, unknown>
  try { json = await response.json() }
  catch { return { success: false, error: 'Invalid JSON response from provider' } }

  if (json.success || json.status === 'success' || response.status === 200) {
    return {
      success:          true,
      rd_ref_no:        String(json.ref_no ?? json.rd_ref_no ?? json.reference_number ?? ''),
      rd_response_code: String(json.response_code ?? json.rd_response_code ?? '200'),
    }
  }

  return {
    success: false,
    error:   String(json.error ?? json.message ?? json.error_description ?? 'Unknown provider error'),
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // ── Auth: validate CRON_SECRET ──
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (token !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // ── Env ──
  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const providerUrl     = Deno.env.get('ETAX_PROVIDER_URL') ?? ''
  const apiKey          = Deno.env.get('ETAX_API_KEY') ?? ''
  const sellerTaxId     = Deno.env.get('ETAX_SELLER_TAX_ID') ?? ''
  const sellerName      = Deno.env.get('ETAX_SELLER_NAME') ?? 'Monolith Platform'

  if (!providerUrl || !apiKey || !sellerTaxId) {
    return new Response(
      JSON.stringify({
        error: 'Missing required env vars: ETAX_PROVIDER_URL, ETAX_API_KEY, ETAX_SELLER_TAX_ID',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const result: WorkerResult = {
    processed: 0, submitted: 0, failed: 0,
    pdf_ok:    0, pdf_fail:  0,
    errors:    [],
  }

  // ── 1. Claim a batch atomically ──
  let batch: EtaxSubmission[]
  try {
    batch = await claimBatch(supabase, BATCH_LIMIT)
  } catch (err) {
    console.error('[etax-submit-worker] claimBatch failed:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to claim batch', detail: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (batch.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, submitted: 0, failed: 0, message: 'No queued submissions' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  console.log(`[etax-submit-worker] Processing ${batch.length} submissions`)
  result.processed = batch.length

  // ── 2. Process each submission independently ──
  const promises = batch.map(async (submission) => {
    const logPrefix = `[etax-submit-worker][${submission.id}]`

    try {
      // 2a. Fetch invoice details
      const invoice = await fetchInvoiceDetail(supabase, submission.invoice_id)
      const invoiceDetail: InvoiceDetail = invoice ?? {
        invoice_number:  submission.document_number,
        customer_name:   submission.buyer_name ?? 'ลูกค้า',
        customer_tax_id: submission.buyer_tax_id,
        due_date:        null,
        total_amount:    submission.gross_amount,
        notes:           null,
      }

      // 2b. Generate UBL XML
      const xml = buildUblXml(submission, sellerTaxId, sellerName, invoiceDetail)
      console.log(`${logPrefix} XML generated (${xml.length} chars)`)

      // 2c. Submit to provider
      const providerResult = await submitToProvider(
        providerUrl, apiKey, xml,
        submission.document_number, submission.document_type,
      )

      if (providerResult.success) {
        // 2d. Mark submission as submitted
        await markSubmitted(
          supabase, submission.id,
          providerResult.rd_ref_no ?? '',
          providerResult.rd_response_code ?? '200',
          xml,
        )
        console.log(`${logPrefix} ✅ Submitted — rd_ref_no: ${providerResult.rd_ref_no}`)
        result.submitted++

        // ── 2e. Inline PDF download (added in 0183) ──────────────────────
        // Non-fatal: PDF failure NEVER rolls back the submission success.
        // trg_queue_pdf_on_submitted already set pdf_status='pending' above;
        // downloadAndStorePdf moves it to 'downloaded' or 'failed'.
        const pdfOk = await downloadAndStorePdf(
          supabase, submission,
          providerResult.rd_ref_no ?? '',
          providerUrl, apiKey,
        )
        if (pdfOk) { result.pdf_ok++ }
        else        { result.pdf_fail++ }
        // ─────────────────────────────────────────────────────────────────

      } else {
        // 2f. Mark failed
        const errMsg = providerResult.error ?? 'Unknown error'
        await markFailed(supabase, submission.id, errMsg)
        console.error(`${logPrefix} ❌ Failed: ${errMsg}`)
        result.failed++
        result.errors.push({ id: submission.id, error: errMsg })
      }
    } catch (err) {
      // Per-submission isolation
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`${logPrefix} ❌ Unexpected error: ${errMsg}`)
      await markFailed(supabase, submission.id, errMsg).catch(() => {})
      result.failed++
      result.errors.push({ id: submission.id, error: errMsg })
    }
  })

  // Run all in parallel
  await Promise.allSettled(promises)

  console.log(
    `[etax-submit-worker] Done — processed:${result.processed} ` +
    `submitted:${result.submitted} failed:${result.failed} ` +
    `pdf_ok:${result.pdf_ok} pdf_fail:${result.pdf_fail}`,
  )

  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
})
