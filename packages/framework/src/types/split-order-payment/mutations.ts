/**
 * DTO for creating split order payments.
 *
 * @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
 */
export type CreateSplitOrderPaymentsDTO = {
  order_id: string
  status: string
  currency_code: string
  authorized_amount: number
  payment_collection_id: string
  /**
   * Platform fee amount in the order's currency.
   * Optional - defaults to 0 if not provided.
   */
  platform_fee?: number
  /**
   * Platform fee mode: "on_top" | "included".
   * Optional - nullable for backwards compatibility.
   */
  platform_fee_mode?: string
}

export type UpdateSplitOrderPaymentsDTO = {
  id: string
  status?: string
  authorized_amount?: number
  captured_amount?: number
  refunded_amount?: number
}

export type RefundSplitOrderPaymentsDTO = {
  id: string
  amount: number
}
