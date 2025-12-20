import { SubscriberConfig } from '@medusajs/framework'
import {
  ContainerRegistrationKeys,
  MedusaError
} from '@medusajs/framework/utils'
import { SubscriberArgs } from '@medusajs/medusa'
import { capturePaymentWorkflow } from '@medusajs/medusa/core-flows'

import { OrderSetWorkflowEvents } from '@mercurjs/framework'

import { markSplitOrderPaymentsAsCapturedWorkflow } from '../workflows/split-order-payment/workflows'

/**
 * Handles payment capture after order set is placed.
 *
 * For normal events: Captures payment immediately.
 * For approval-required events: Skips capture, payment stays in AUTHORIZED state
 * until the event organizer explicitly approves the attendee.
 */
export default async function orderSetPlacedHandler({
  event,
  container
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { id: orderSetId } = event.data

  // Fetch order set with cart_id to check requires_approval metadata
  const {
    data: [order_set]
  } = await query.graph({
    entity: 'order_set',
    fields: ['payment_collection_id', 'cart_id'],
    filters: {
      id: orderSetId
    }
  })

  // Fetch cart to check requires_approval metadata
  const {
    data: [cart]
  } = await query.graph({
    entity: 'cart',
    fields: ['metadata'],
    filters: {
      id: order_set.cart_id
    }
  })

  // Check if event requires attendee approval (pre-authorization flow)
  const requiresApproval = cart?.metadata?.requires_approval === true

  if (requiresApproval) {
    console.log(`[PaymentCapture] Order set ${orderSetId} requires approval - SKIPPING automatic capture. Payment stays in AUTHORIZED state.`)
    // Don't capture payment - it stays in AUTHORIZED state
    // Payment will be captured later when organizer approves the attendee
    return
  }

  // Normal flow: Capture payment immediately
  const {
    data: [payment_collection]
  } = await query.graph({
    entity: 'payment_collection',
    fields: ['status', 'payments.*'],
    filters: {
      id: order_set.payment_collection_id
    }
  })

  if (!payment_collection || !payment_collection.payments[0]) {
    return
  }

  const { result } = await capturePaymentWorkflow.run({
    container,
    input: {
      payment_id: payment_collection.payments[0].id
    }
  })

  if (!result.captured_at) {
    throw new MedusaError(
      MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
      'Payment failed!'
    )
  }

  await markSplitOrderPaymentsAsCapturedWorkflow.run({
    container,
    input: order_set.payment_collection_id
  })
}

export const config: SubscriberConfig = {
  event: OrderSetWorkflowEvents.PLACED,
  context: {
    subscriberId: 'order-set-placed-payment-capture'
  }
}
