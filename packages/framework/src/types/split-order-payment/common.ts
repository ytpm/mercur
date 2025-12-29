/**
 * SplitOrderPayment DTO
 *
 * Represents payment tracking for a single order in a multi-seller marketplace.
 *
 * @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
 */
export type SplitOrderPaymentDTO = {
  id: string
  status: string
  currency_code: string
  authorized_amount: number
  captured_amount: number
  refunded_amount: number
  payment_collection_id: string
  /**
   * Platform fee amount in the order's currency.
   * For "on_top" mode: Added to ticket price (customer paid extra).
   * For "included" mode: Deducted from vendor's payout.
   */
  platform_fee: number
  /**
   * Platform fee mode: "on_top" | "included" | null.
   * Nullable for backwards compatibility with legacy orders.
   */
  platform_fee_mode: string | null
}
