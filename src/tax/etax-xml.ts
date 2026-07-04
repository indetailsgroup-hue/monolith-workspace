// Feature: monolith-accounting — e-Tax XML serialization (ACC-11 Round-Trip)
// Pure: serialize SaleInvoice → XML (ที่ฝังใน PDF/A-3) → parse กลับได้ข้อมูลตรงต้นทาง.
// XML escaping เป็น inverse ที่ถูกต้อง (กันอักขระพิเศษ & < > " ' + unicode/newline).

export interface SaleItem {
  description: string;
  qty: number;
  unitPrice: number;
}
export interface SaleInvoice {
  invoiceNumber: string;
  sellerTaxId: string;
  buyerTaxId: string;
  date: string; // ISO
  items: SaleItem[];
  net: number;
  vat: number;
  gross: number;
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** escape ตามลำดับ & ก่อน (สำคัญ) เพื่อให้ unescape เป็น inverse ที่ถูกต้อง */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&'); // &amp; สุดท้าย = inverse ที่ถูกต้อง
}

function tag(name: string, inner: string): string {
  return `<${name}>${inner}</${name}>`;
}
function numTag(name: string, v: number): string {
  if (!Number.isFinite(v)) throw new Error(`etax-xml: ค่า ${name} ต้องเป็นตัวเลขจำกัด (fail-closed)`);
  return tag(name, String(round2(v)));
}
function strTag(name: string, v: string): string {
  return tag(name, escapeXml(v));
}

/** serialize เป็น XML (deterministic) */
export function serializeSaleXml(inv: SaleInvoice): string {
  const items = inv.items
    .map((it) => `<item>${strTag('description', it.description)}${numTag('qty', it.qty)}${numTag('unitPrice', it.unitPrice)}</item>`)
    .join('');
  return (
    '<invoice>' +
    strTag('invoiceNumber', inv.invoiceNumber) +
    strTag('sellerTaxId', inv.sellerTaxId) +
    strTag('buyerTaxId', inv.buyerTaxId) +
    strTag('date', inv.date) +
    numTag('net', inv.net) +
    numTag('vat', inv.vat) +
    numTag('gross', inv.gross) +
    `<items>${items}</items>` +
    '</invoice>'
  );
}

function extractScalar(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!m) throw new Error(`etax-xml: ไม่พบ tag <${name}>`);
  return m[1];
}

/** parse XML กลับเป็น SaleInvoice (inverse ของ serialize) */
export function parseSaleXml(xml: string): SaleInvoice {
  const itemsBlock = (xml.match(/<items>([\s\S]*?)<\/items>/) ?? ['', ''])[1];
  const itemMatches = [...itemsBlock.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const items: SaleItem[] = itemMatches.map((m) => {
    const inner = m[1];
    return {
      description: unescapeXml(extractScalar(inner, 'description')),
      qty: Number(extractScalar(inner, 'qty')),
      unitPrice: Number(extractScalar(inner, 'unitPrice')),
    };
  });
  return {
    invoiceNumber: unescapeXml(extractScalar(xml, 'invoiceNumber')),
    sellerTaxId: unescapeXml(extractScalar(xml, 'sellerTaxId')),
    buyerTaxId: unescapeXml(extractScalar(xml, 'buyerTaxId')),
    date: unescapeXml(extractScalar(xml, 'date')),
    net: Number(extractScalar(xml, 'net')),
    vat: Number(extractScalar(xml, 'vat')),
    gross: Number(extractScalar(xml, 'gross')),
    items,
  };
}

/** normalize (amounts → round2) เพื่อเทียบ round-trip */
export function normalizeSale(inv: SaleInvoice): SaleInvoice {
  return {
    ...inv,
    net: round2(inv.net),
    vat: round2(inv.vat),
    gross: round2(inv.gross),
    items: inv.items.map((it) => ({ ...it, qty: round2(it.qty), unitPrice: round2(it.unitPrice) })),
  };
}
