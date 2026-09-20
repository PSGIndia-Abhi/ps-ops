/** Amount after a percentage coupon, rounded exactly like the bestserve.in website does. */
export function discountedAmount(listPrice: number, percentage: number): number {
  return listPrice - Math.round((listPrice * percentage) / 100);
}
