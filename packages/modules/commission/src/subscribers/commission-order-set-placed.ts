import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { OrderSetWorkflowEvents, SELLER_ORDER_LINK } from "@ytpm/mercurjs-framework";
import { calculateCommissionWorkflow } from "../workflows/commission/workflows";

/**
 * Commission Order Set Placed Handler
 *
 * Handles commission line creation when an order set is placed.
 *
 * Commission Restructure:
 * - Orders with platform_fee > 0 in SplitOrderPayment SKIP this handler
 * - These orders use pre-calculated platform_fee (set during ticket checkout)
 * - Only legacy orders (platform_fee = 0) create commission lines
 *
 * @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
 */
export default async function commissionOrderSetPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  logger.info(`[commissionOrderSetPlacedHandler] Processing order set: ${event.data.id}`);

  const {
    data: [set],
  } = await query.graph({
    entity: "order_set",
    fields: ["orders.id", "orders.split_order_payment.*"],
    filters: {
      id: event.data.id,
    },
  });

  const ordersCreated = set.orders.map((o) => o.id);

  for (const order_id of ordersCreated) {
    // Find the order with split_order_payment data
    const orderData = set.orders.find((o: any) => o.id === order_id);
    const splitOrderPayment = orderData?.split_order_payment;

    /**
     * Skip commission line creation for orders with pre-calculated platform_fee.
     * These orders already have commission handled via Stripe application_fee_amount.
     *
     * @deprecated Commission lines are being phased out in favor of platform_fee.
     */
    if (splitOrderPayment?.platform_fee && Number(splitOrderPayment.platform_fee) > 0) {
      logger.info(
        `[commissionOrderSetPlacedHandler] Skipping commission lines for order ${order_id} - ` +
        `platform_fee already set: ${splitOrderPayment.platform_fee}`
      );
      continue;
    }

    const {
      data: [seller],
    } = await query.graph({
      entity: SELLER_ORDER_LINK,
      fields: ["seller_id"],
      filters: {
        order_id: order_id,
      },
    });

    if (!seller) {
      logger.warn(`[commissionOrderSetPlacedHandler] No seller found for order ${order_id}`);
      return;
    }

    logger.info(`[commissionOrderSetPlacedHandler] Creating commission lines for order ${order_id} (legacy flow)`);

    await calculateCommissionWorkflow.run({
      input: {
        order_id: order_id,
        seller_id: seller.seller_id,
      },
      container,
    });
  }
}

export const config: SubscriberConfig = {
  event: OrderSetWorkflowEvents.PLACED,
  context: {
    subscriberId: "commission-order-set-placed-handler",
  },
};
