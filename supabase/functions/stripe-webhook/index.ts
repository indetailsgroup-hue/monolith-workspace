/**
 * Supabase Edge Function: stripe-webhook
 *
 * Handles Stripe webhook events for subscription lifecycle:
 * - customer.subscription.created → activate plan
 * - customer.subscription.updated → change plan/interval
 * - customer.subscription.deleted → downgrade to FREE
 * - checkout.session.completed → link customer to org
 * - invoice.paid → record payment
 * - invoice.payment_failed → flag org
 *
 * Deployment:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 *
 * Required secrets:
 *   STRIPE_WEBHOOK_SECRET — Stripe endpoint signing secret (whsec_...)
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS for org updates
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ============================================================================
// Types
// ============================================================================

interface StripeSubscription {
  id: string;
  customer: string;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing' | 'incomplete';
  items: {
    data: Array<{
      price: { id: string };
    }>;
  };
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string>;
}

interface StripeCheckoutSession {
  id: string;
  customer: string;
  subscription: string;
  metadata?: Record<string, string>;
  client_reference_id?: string;
}

interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string;
  amount_paid: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripeSubscription | StripeCheckoutSession | StripeInvoice;
  };
}

type OrgPlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

// ============================================================================
// Price → Plan mapping (must match billing.ts PLAN_PRICING)
// ============================================================================

const PRICE_TO_PLAN: Record<string, OrgPlan> = {
  price_starter_monthly: 'STARTER',
  price_starter_yearly: 'STARTER',
  price_pro_monthly: 'PROFESSIONAL',
  price_pro_yearly: 'PROFESSIONAL',
  price_enterprise_monthly: 'ENTERPRISE',
  price_enterprise_yearly: 'ENTERPRISE',
};

const PLAN_MAX_USERS: Record<OrgPlan, number> = {
  FREE: 2,
  STARTER: 5,
  PROFESSIONAL: 20,
  ENTERPRISE: 999,
};

const PLAN_MAX_JOBS: Record<OrgPlan, number> = {
  FREE: 10,
  STARTER: 50,
  PROFESSIONAL: 200,
  ENTERPRISE: 9999,
};

// ============================================================================
// Crypto: Verify Stripe signature
// ============================================================================

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const parts = signature.split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const v1Sig = parts.find((p) => p.startsWith('v1='))?.slice(3);

  if (!timestamp || !v1Sig) return false;

  // Tolerance: 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return expectedSig === v1Sig;
}

// ============================================================================
// Helpers
// ============================================================================

function getPlanFromPriceId(priceId: string): OrgPlan {
  return PRICE_TO_PLAN[priceId] || 'FREE';
}

function getIntervalFromPriceId(priceId: string): 'monthly' | 'yearly' {
  return priceId.includes('yearly') ? 'yearly' : 'monthly';
}

// ============================================================================
// Event Handlers
// ============================================================================

async function handleSubscriptionCreated(
  supabase: ReturnType<typeof createClient>,
  subscription: StripeSubscription
) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) {
    console.error('No org_id in subscription metadata');
    return { error: 'missing_org_id' };
  }

  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);
  const interval = getIntervalFromPriceId(priceId);

  const { error } = await supabase
    .from('organizations')
    .update({
      plan,
      status: 'ACTIVE',
      max_users: PLAN_MAX_USERS[plan],
      max_jobs_per_month: PLAN_MAX_JOBS[plan],
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      billing_interval: interval,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (error) {
    console.error('Failed to update org on subscription.created:', error);
    return { error: error.message };
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    org_id: orgId,
    action: 'billing.subscription_created',
    actor_type: 'system',
    actor_id: 'stripe-webhook',
    metadata: { subscription_id: subscription.id, plan, interval },
  });

  return { success: true, plan };
}

async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createClient>,
  subscription: StripeSubscription
) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) {
    console.error('No org_id in subscription metadata');
    return { error: 'missing_org_id' };
  }

  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);
  const interval = getIntervalFromPriceId(priceId);

  const updateData: Record<string, unknown> = {
    plan,
    max_users: PLAN_MAX_USERS[plan],
    max_jobs_per_month: PLAN_MAX_JOBS[plan],
    billing_interval: interval,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Handle cancellation scheduled
  if (subscription.cancel_at_period_end) {
    updateData.cancel_at_period_end = true;
  } else {
    updateData.cancel_at_period_end = false;
  }

  // Handle status changes
  if (subscription.status === 'past_due') {
    updateData.status = 'SUSPENDED';
  } else if (subscription.status === 'active') {
    updateData.status = 'ACTIVE';
  }

  const { error } = await supabase
    .from('organizations')
    .update(updateData)
    .eq('id', orgId);

  if (error) {
    console.error('Failed to update org on subscription.updated:', error);
    return { error: error.message };
  }

  await supabase.from('audit_logs').insert({
    org_id: orgId,
    action: 'billing.subscription_updated',
    actor_type: 'system',
    actor_id: 'stripe-webhook',
    metadata: {
      subscription_id: subscription.id,
      plan,
      interval,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
  });

  return { success: true, plan };
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createClient>,
  subscription: StripeSubscription
) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) {
    console.error('No org_id in subscription metadata');
    return { error: 'missing_org_id' };
  }

  const { error } = await supabase
    .from('organizations')
    .update({
      plan: 'FREE',
      status: 'ACTIVE',
      max_users: PLAN_MAX_USERS.FREE,
      max_jobs_per_month: PLAN_MAX_JOBS.FREE,
      stripe_subscription_id: null,
      billing_interval: null,
      cancel_at_period_end: false,
      current_period_start: null,
      current_period_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (error) {
    console.error('Failed to update org on subscription.deleted:', error);
    return { error: error.message };
  }

  await supabase.from('audit_logs').insert({
    org_id: orgId,
    action: 'billing.subscription_deleted',
    actor_type: 'system',
    actor_id: 'stripe-webhook',
    metadata: { subscription_id: subscription.id, downgraded_to: 'FREE' },
  });

  return { success: true, plan: 'FREE' };
}

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createClient>,
  session: StripeCheckoutSession
) {
  const orgId = session.metadata?.org_id || session.client_reference_id;
  if (!orgId) {
    console.error('No org_id in checkout session');
    return { error: 'missing_org_id' };
  }

  // Link Stripe customer to org
  const { error } = await supabase
    .from('organizations')
    .update({
      stripe_customer_id: session.customer,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (error) {
    console.error('Failed to link customer on checkout.completed:', error);
    return { error: error.message };
  }

  await supabase.from('audit_logs').insert({
    org_id: orgId,
    action: 'billing.checkout_completed',
    actor_type: 'system',
    actor_id: 'stripe-webhook',
    metadata: { session_id: session.id, customer_id: session.customer },
  });

  return { success: true };
}

async function handleInvoicePaid(
  supabase: ReturnType<typeof createClient>,
  invoice: StripeInvoice
) {
  // Find org by stripe_customer_id
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', invoice.customer)
    .single();

  if (!org) {
    console.error('No org found for customer:', invoice.customer);
    return { error: 'org_not_found' };
  }

  await supabase.from('audit_logs').insert({
    org_id: org.id,
    action: 'billing.invoice_paid',
    actor_type: 'system',
    actor_id: 'stripe-webhook',
    metadata: {
      invoice_id: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
    },
  });

  return { success: true };
}

async function handleInvoicePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  invoice: StripeInvoice
) {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', invoice.customer)
    .single();

  if (!org) return { error: 'org_not_found' };

  // Mark org as suspended after payment failure
  await supabase
    .from('organizations')
    .update({ status: 'SUSPENDED', updated_at: new Date().toISOString() })
    .eq('id', org.id);

  await supabase.from('audit_logs').insert({
    org_id: org.id,
    action: 'billing.payment_failed',
    actor_type: 'system',
    actor_id: 'stripe-webhook',
    metadata: { invoice_id: invoice.id, amount: invoice.amount_paid },
  });

  return { success: true };
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return new Response('Server configuration error', { status: 500 });
  }

  const body = await req.text();

  // Verify signature
  const isValid = await verifyStripeSignature(body, signature, webhookSecret);
  if (!isValid) {
    console.error('Invalid Stripe webhook signature');
    return new Response('Invalid signature', { status: 401 });
  }

  const event: StripeEvent = JSON.parse(body);

  // Initialize Supabase with service role (bypasses RLS)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let result: Record<string, unknown>;

  switch (event.type) {
    case 'customer.subscription.created':
      result = await handleSubscriptionCreated(supabase, event.data.object as StripeSubscription);
      break;
    case 'customer.subscription.updated':
      result = await handleSubscriptionUpdated(supabase, event.data.object as StripeSubscription);
      break;
    case 'customer.subscription.deleted':
      result = await handleSubscriptionDeleted(supabase, event.data.object as StripeSubscription);
      break;
    case 'checkout.session.completed':
      result = await handleCheckoutCompleted(supabase, event.data.object as StripeCheckoutSession);
      break;
    case 'invoice.paid':
      result = await handleInvoicePaid(supabase, event.data.object as StripeInvoice);
      break;
    case 'invoice.payment_failed':
      result = await handleInvoicePaymentFailed(supabase, event.data.object as StripeInvoice);
      break;
    default:
      console.log('Unhandled event type:', event.type);
      result = { skipped: true, event_type: event.type };
  }

  return new Response(JSON.stringify({ received: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
