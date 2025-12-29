import { model } from '@medusajs/framework/utils'

/**
 * SplitOrderPayment model
 *
 * Tracks payment amounts per order in a multi-seller marketplace.
 * Used for:
 * - Tracking authorized, captured, refunded amounts per order
 * - Storing platform fee for commission restructure
 *
 * @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
 */
export const SplitOrderPayment = model.define('split_order_payment', {
  id: model.id({ prefix: 'sp_ord_pay' }).primaryKey(),
  status: model.text(),
  currency_code: model.text(),
  authorized_amount: model.bigNumber(),
  captured_amount: model.bigNumber().default(0),
  refunded_amount: model.bigNumber().default(0),
  payment_collection_id: model.text(),
  /**
   * Platform fee amount in the order's currency.
   * This is the commission that the platform keeps from the order.
   * For "on_top" mode: This amount was added to the ticket price (customer paid extra).
   * For "included" mode: This amount is deducted from the vendor's payout.
   */
  platform_fee: model.bigNumber().default(0),
  /**
   * Platform fee mode: "on_top" or "included".
   * - "on_top": Fee was added on top of ticket price (customer paid extra)
   * - "included": Fee is included in ticket price (vendor receives less)
   * Nullable for backwards compatibility with legacy orders.
   */
  platform_fee_mode: model.text().nullable(),
})
