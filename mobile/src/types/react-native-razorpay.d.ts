// react-native-razorpay ships no TypeScript declarations next to its JS entry, so this
// describes only the part of its API the app uses (RazorpayCheckout.open).
declare module 'react-native-razorpay' {
  export interface RazorpayOptions {
    key: string;
    /** In paise (Rs 100 = 10000). */
    amount: number | string;
    currency?: string;
    name?: string;
    description?: string;
    order_id?: string;
    prefill?: { name?: string; email?: string; contact?: string };
    theme?: { color?: string };
    [key: string]: unknown;
  }

  export interface RazorpaySuccess {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  }

  export interface RazorpayError {
    /** 0 = the customer closed the checkout without paying. */
    code: number;
    description: string;
  }

  const RazorpayCheckout: {
    open(options: RazorpayOptions): Promise<RazorpaySuccess>;
  };
  export default RazorpayCheckout;
}
