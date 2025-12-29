import { ContainerRegistrationKeys, MathBN } from '@medusajs/framework/utils'
import { StepResponse, createStep } from '@medusajs/framework/workflows-sdk'

import { SplitOrderPaymentDTO } from '@mercurjs/framework'

/**
 * Calculate payout for an order by subtracting platform fee from captured amount.
 *
 * Commission Restructure:
 * - Previously queried commission_lines table and summed values
 * - Now uses pre-calculated platform_fee from SplitOrderPayment
 * - Platform fee is set during ticket checkout and stored with order
 *
 * Formula: payout = captured_amount - refunded_amount - platform_fee
 *
 * @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
 */
export const calculatePayoutForOrderStep = createStep(
  'calculate-payout-for-order',
  async (
    input: {
      order_id: string
    },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

    logger.info(`[calculatePayoutForOrderStep] Calculating payout for order: ${input.order_id}`)

    const {
      data: [order]
    } = await query.graph({
      entity: 'order',
      fields: ['items.id', 'split_order_payment.*'],
      filters: {
        id: input.order_id
      }
    })

    const orderPayment: SplitOrderPaymentDTO = order.split_order_payment

    /**
     * Use platform_fee from SplitOrderPayment instead of querying commission_lines.
     * Platform fee was pre-calculated during ticket checkout based on event commission settings.
     *
     * @deprecated Old commission_lines query - kept for reference during migration
     *
     * const order_line_items = order.items.map((i) => i.id)
     * const { data: commission_lines } = await query.graph({
     *   entity: 'commission_line',
     *   fields: ['*'],
     *   filters: { item_line_id: order_line_items }
     * })
     * const total_commission = commission_lines.reduce((acc, current) => {
     *   return MathBN.add(acc, current.value)
     * }, MathBN.convert(0))
     */
    const platform_fee = MathBN.convert(orderPayment.platform_fee || 0)

    const captured_amount = MathBN.convert(orderPayment.captured_amount)
    const refunded_amount = MathBN.convert(orderPayment.refunded_amount)

    /**
     * Payout calculation:
     * - captured_amount: Total amount captured from customer
     * - refunded_amount: Total amount refunded to customer
     * - platform_fee: Platform commission (already deducted via Stripe application_fee_amount)
     *
     * Note: For "on_top" mode, platform_fee was included in the inflated price
     * and sent to Stripe as application_fee_amount, so Bumpy received it directly.
     * The payout here represents what the vendor should receive.
     */
    const payout_total = captured_amount
      .minus(refunded_amount)
      .minus(platform_fee)

    logger.info(`[calculatePayoutForOrderStep] Order ${input.order_id}: captured=${captured_amount}, refunded=${refunded_amount}, platform_fee=${platform_fee}, payout=${payout_total}`)

    return new StepResponse(payout_total)
  }
)
