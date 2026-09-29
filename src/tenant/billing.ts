/**
 * tenant/billing.ts — Stripe Billing Integration for MONOLITH Multi-Tenant
 *
 * Provides:
 * - Plan pricing definitions
 * - Stripe Checkout session creation
 * - Subscription management (upgrade/downgrade)
 * - Webhook event handling types
 * - Usage metering helpers
 *
 * Integration flow:
 * 1. User clicks "Upgrade" → createCheckoutSession() → redirect to Stripe
 * 2. Stripe webhook → handleBillingWebhook() → update org plan in DB
 * 3. Customer portal → createPortalSession() → manage subscription
 */

import type { OrgPlan, Organization } from './types';

// ============================================================================
// Pricing Configuration
// ============================================================================

export interface PlanPricing {
  plan: OrgPlan;
  name: string;
  description: string;
  monthlyPrice: number;       // USD cents
  yearlyPrice: number;        // USD cents (per year)
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  features: string[];
  highlighted?: boolean;
}

export const PLAN_PRICING: PlanPricing[] = [
  {
    plan: 'FREE',
    name: 'Free',
    description: 'สำหรับทดลองใช้งาน',
    monthlyPrice: 0,
    yearlyPrice: 0,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    features: ['ผู้ใช้ 2 คน', '10 งาน/เดือน', 'ออกแบบพื้นฐาน', 'Export แบบ manual'],
  },
  {
    plan: 'STARTER',
    name: 'Starter',
    description: 'สำหรับทีมเล็ก',
    monthlyPrice: 2900,  // ฿29/mo equivalent
    yearlyPrice: 29000,
    stripePriceIdMonthly: 'price_starter_monthly',
    stripePriceIdYearly: 'price_starter_yearly',
    features: ['ผู้ใช้ 5 คน', '50 งาน/เดือน', 'Nesting optimizer', 'ใบเสนอราคา', 'Email support'],
  },
  {
    plan: 'PROFESSIONAL',
    name: 'Professional',
    description: 'สำหรับธุรกิจขนาดกลาง',
    monthlyPrice: 7900,
    yearlyPrice: 79000,
    stripePriceIdMonthly: 'price_pro_monthly',
    stripePriceIdYearly: 'price_pro_yearly',
    features: ['ผู้ใช้ 20 คน', '200 งาน/เดือน', 'Curved panels', 'DXF export', 'Analytics', 'Priority support'],
    highlighted: true,
  },
  {
    plan: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'สำหรับองค์กรขนาดใหญ่',
    monthlyPrice: 19900,
    yearlyPrice: 199000,
    stripePriceIdMonthly: 'price_enterprise_monthly',
    stripePriceIdYearly: 'price_enterprise_yearly',
    features: ['ผู้ใช้ไม่จำกัด', 'งานไม่จำกัด', 'API access', 'SSO/SAML', 'Custom branding', 'Dedicated support', 'SLA guarantee'],
  },
];

// ============================================================================
// Billing Types
// ============================================================================

export type BillingInterval = 'monthly' | 'yearly';

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'trialing'
  | 'incomplete'
  | 'unpaid';

export interface BillingSubscription {
  subscriptionId: string;
  orgId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  plan: OrgPlan;
  interval: BillingInterval;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
}

export interface BillingInvoice {
  invoiceId: string;
  stripeInvoiceId: string;
  orgId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  invoiceUrl?: string;
  pdfUrl?: string;
  createdAt: string;
}

// ============================================================================
// Checkout & Portal
// ============================================================================

export interface CreateCheckoutParams {
  orgId: string;
  plan: OrgPlan;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  trialDays?: number;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

export interface CreatePortalParams {
  orgId: string;
  returnUrl: string;
}

export interface PortalSession {
  url: string;
}

/**
 * Create a Stripe Checkout session for plan subscription.
 * In production: calls Supabase Edge Function → Stripe API.
 */
export async function createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
  const pricing = PLAN_PRICING.find((p) => p.plan === params.plan);
  if (!pricing) throw new Error(`Invalid plan: ${params.plan}`);
  if (params.plan === 'FREE') throw new Error('Cannot create checkout for FREE plan');

  const priceId = params.interval === 'monthly'
    ? pricing.stripePriceIdMonthly
    : pricing.stripePriceIdYearly;

  // Call Edge Function
  const response = await fetch('/api/billing/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgId: params.orgId,
      priceId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      customerEmail: params.customerEmail,
      trialDays: params.trialDays ?? 14,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create checkout session');
  }

  return response.json();
}

/**
 * Create a Stripe Customer Portal session for subscription management.
 */
export async function createPortalSession(params: CreatePortalParams): Promise<PortalSession> {
  const response = await fetch('/api/billing/create-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgId: params.orgId,
      returnUrl: params.returnUrl,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create portal session');
  }

  return response.json();
}

// ============================================================================
// Plan Change Logic
// ============================================================================

export type PlanChangeDirection = 'upgrade' | 'downgrade' | 'same';

export function getPlanChangeDirection(current: OrgPlan, target: OrgPlan): PlanChangeDirection {
  const order: OrgPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
  const currentIdx = order.indexOf(current);
  const targetIdx = order.indexOf(target);
  if (targetIdx > currentIdx) return 'upgrade';
  if (targetIdx < currentIdx) return 'downgrade';
  return 'same';
}

export function canChangePlan(org: Organization, targetPlan: OrgPlan): { allowed: boolean; reason?: string } {
  if (org.status === 'SUSPENDED') {
    return { allowed: false, reason: 'องค์กรถูกระงับ กรุณาติดต่อฝ่ายสนับสนุน' };
  }
  if (org.plan === targetPlan) {
    return { allowed: false, reason: 'คุณอยู่ในแพลนนี้แล้ว' };
  }
  return { allowed: true };
}

/**
 * Calculate proration amount for mid-cycle plan change.
 * Returns amount in smallest currency unit (cents/satang).
 */
export function calculateProration(
  currentPlan: OrgPlan,
  targetPlan: OrgPlan,
  interval: BillingInterval,
  daysRemaining: number,
  totalDaysInPeriod: number
): number {
  const currentPricing = PLAN_PRICING.find((p) => p.plan === currentPlan);
  const targetPricing = PLAN_PRICING.find((p) => p.plan === targetPlan);
  if (!currentPricing || !targetPricing) return 0;

  const currentPrice = interval === 'monthly' ? currentPricing.monthlyPrice : currentPricing.yearlyPrice / 12;
  const targetPrice = interval === 'monthly' ? targetPricing.monthlyPrice : targetPricing.yearlyPrice / 12;

  const dailyDiff = (targetPrice - currentPrice) / totalDaysInPeriod;
  return Math.round(dailyDiff * daysRemaining);
}

// ============================================================================
// Webhook Event Types
// ============================================================================

export type BillingWebhookEvent =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed';

export interface WebhookPayload {
  event: BillingWebhookEvent;
  data: Record<string, unknown>;
}

/**
 * Map Stripe price ID to our OrgPlan.
 */
export function stripePriceToOrgPlan(priceId: string): OrgPlan | null {
  for (const pricing of PLAN_PRICING) {
    if (pricing.stripePriceIdMonthly === priceId || pricing.stripePriceIdYearly === priceId) {
      return pricing.plan;
    }
  }
  return null;
}

/**
 * Determine billing interval from Stripe price ID.
 */
export function stripePriceToInterval(priceId: string): BillingInterval | null {
  for (const pricing of PLAN_PRICING) {
    if (pricing.stripePriceIdMonthly === priceId) return 'monthly';
    if (pricing.stripePriceIdYearly === priceId) return 'yearly';
  }
  return null;
}
