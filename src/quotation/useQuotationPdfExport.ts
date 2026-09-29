/**
 * quotation/useQuotationPdfExport.ts — Client hook for Edge Function PDF generation
 *
 * Calls the Supabase Edge Function `generate-quotation-pdf` with Thai locale formatting.
 * Falls back to local jsPDF generation if Edge Function is unavailable.
 *
 * @version 15.2.0
 */

import { useState, useCallback } from 'react';
import { type Quotation } from './types';
import { downloadQuotationPdf } from './buildQuotationPdf';

// ============================================================================
// Types
// ============================================================================

export interface PdfExportState {
  isGenerating: boolean;
  error: string | null;
  lastExportedAt: string | null;
}

export interface UseQuotationPdfExportReturn extends PdfExportState {
  /** Generate and download PDF via Edge Function (Thai locale) */
  exportPdf: (quotation: Quotation) => Promise<void>;
  /** Clear error state */
  clearError: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useQuotationPdfExport(): UseQuotationPdfExportReturn {
  const [state, setState] = useState<PdfExportState>({
    isGenerating: false,
    error: null,
    lastExportedAt: null,
  });

  const exportPdf = useCallback(async (quotation: Quotation) => {
    setState({ isGenerating: true, error: null, lastExportedAt: null });

    try {
      // Try Edge Function first
      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
      const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseAnonKey) {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/generate-quotation-pdf`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseAnonKey}`,
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify({
              quotation,
              options: {
                companyName: 'DAPH Decor Co., Ltd.',
                companyNameTh: 'บริษัท ดาฟ เดคอร์ จำกัด',
                companyAddressTh: '123/45 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',
                bankName: 'ธนาคารกสิกรไทย (KBANK)',
                bankAccount: '123-4-56789-0',
              },
            }),
          },
        );

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${quotation.quotationCode}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          setState({
            isGenerating: false,
            error: null,
            lastExportedAt: new Date().toISOString(),
          });
          return;
        }

        // If Edge Function returns non-OK, fall through to local generation
        console.warn('[QuotationPDF] Edge Function returned', response.status, '— falling back to local');
      }

      // Fallback: local jsPDF generation
      downloadQuotationPdf(quotation);
      setState({
        isGenerating: false,
        error: null,
        lastExportedAt: new Date().toISOString(),
      });
    } catch (err) {
      // Fallback to local generation on network errors
      try {
        downloadQuotationPdf(quotation);
        setState({
          isGenerating: false,
          error: null,
          lastExportedAt: new Date().toISOString(),
        });
      } catch (fallbackErr) {
        setState({
          isGenerating: false,
          error: fallbackErr instanceof Error ? fallbackErr.message : 'PDF generation failed',
          lastExportedAt: null,
        });
      }
    }
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    ...state,
    exportPdf,
    clearError,
  };
}
