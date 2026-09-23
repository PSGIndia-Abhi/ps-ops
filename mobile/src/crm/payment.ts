import RazorpayCheckout, { type RazorpayError } from 'react-native-razorpay';
import { ApiError, crmApi } from '../api';
import { colors } from '../theme';
import type { Lead } from './types';

/**
 * Online (Razorpay) payment for one lead:
 *   1. the server creates the order for the lead's amount,
 *   2. Razorpay's checkout opens inside the app,
 *   3. the payment proof goes back to the server, which verifies the signature and marks the lead Paid.
 * The app never holds the secret key and never decides a payment succeeded on its own.
 */
export type PaymentOutcome =
  | { status: 'paid'; lead: Lead }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

// Safety net: if the checkout screen never opens (or is killed), don't leave a spinner forever.
const CHECKOUT_TIMEOUT_MS = 10 * 60 * 1000;

function isRazorpayError(err: unknown): err is RazorpayError {
  return typeof err === 'object' && err !== null && 'code' in err && 'description' in err;
}

const GENERIC_FAILURE = 'The payment did not go through. Please try again.';

/**
 * Razorpay sometimes hands back its error `description` as a raw JSON string
 * ('{"error":{"code":"BAD_REQUEST_ERROR","description":"Payment Failed",...}}').
 * That must never reach the screen: pull out the human sentence if there is one,
 * and fall back to a plain message for generic or unreadable ones.
 */
export function friendlyPaymentMessage(description: string | undefined): string {
  if (!description) return GENERIC_FAILURE;
  let text = description;
  if (text.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { error?: { description?: string } };
      text = parsed?.error?.description ?? '';
    } catch {
      return GENERIC_FAILURE;
    }
  }
  text = text.trim();
  if (!text || /^payment failed$/i.test(text) || text.startsWith('{')) return GENERIC_FAILURE;
  return text;
}

export async function payForLead(lead: Lead): Promise<PaymentOutcome> {
  try {
    const order = await crmApi.createPaymentOrder(lead.id);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject({ code: 0, description: 'Checkout timed out' } as RazorpayError), CHECKOUT_TIMEOUT_MS);
    });

    let proof;
    try {
      proof = await Promise.race([
        RazorpayCheckout.open({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: 'BestServe',
          description: `${lead.service} - ${lead.plan}`,
          prefill: { name: order.name, contact: order.phone },
          theme: { color: colors.primary },
        }),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!proof.razorpay_order_id || !proof.razorpay_signature) {
      return { status: 'failed', message: 'The payment could not be confirmed. If money was taken, contact support.' };
    }

    const paidLead = await crmApi.verifyPayment(lead.id, {
      razorpay_order_id: proof.razorpay_order_id,
      razorpay_payment_id: proof.razorpay_payment_id,
      razorpay_signature: proof.razorpay_signature,
    });
    return { status: 'paid', lead: paidLead };
  } catch (err) {
    if (err instanceof ApiError) return { status: 'failed', message: err.message };
    if (isRazorpayError(err)) {
      // Code 0 is the customer closing the checkout - not an error worth shouting about.
      if (err.code === 0) return { status: 'cancelled' };
      return { status: 'failed', message: friendlyPaymentMessage(err.description) };
    }
    return { status: 'failed', message: 'Something went wrong with the payment. Please try again.' };
  }
}
