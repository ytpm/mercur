import {
  ContainerRegistrationKeys,
  MedusaError,
  promiseAll
} from '@medusajs/framework/utils'
import { StepResponse, createStep } from '@medusajs/framework/workflows-sdk'

import sellerProductLink from '../../../links/seller-product'
import sellerShippingOptionLink from '../../../links/seller-shipping-option'

type ValidateCartShippingOptionsInput = {
  cart_id: string
  option_ids: string[]
}

export const validateCartShippingOptionsStep = createStep(
  'validate-cart-shipping-options',
  async (input: ValidateCartShippingOptionsInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

    logger.info(`[validateCartShippingOptions] === START VALIDATION ===`)
    logger.info(`[validateCartShippingOptions] Input: cart_id=${input.cart_id}, option_ids=${JSON.stringify(input.option_ids)}`)

    if (input.option_ids.length !== new Set(input.option_ids).size) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        'Some of the shipping methods are doubled!'
      )
    }

    const {
      data: [cart]
    } = await query.graph({
      entity: 'cart',
      fields: ['id', 'items.product_id'],
      filters: { id: input.cart_id }
    })

    logger.info(`[validateCartShippingOptions] Cart items: ${JSON.stringify(cart?.items || [])}`)
    const productIds = cart?.items?.map((item: any) => item.product_id) || []
    logger.info(`[validateCartShippingOptions] Product IDs from cart: ${JSON.stringify(productIds)}`)
    logger.info(`[validateCartShippingOptions] sellerProductLink.entryPoint: ${sellerProductLink.entryPoint}`)
    logger.info(`[validateCartShippingOptions] sellerShippingOptionLink.entryPoint: ${sellerShippingOptionLink.entryPoint}`)

    const [{ data: sellerProducts }, { data: sellerShippingOptions }] =
      await promiseAll([
        query.graph({
          entity: sellerProductLink.entryPoint,
          fields: ['seller_id', 'product_id'],
          filters: {
            product_id: cart.items.map((item: any) => item.product_id)
          }
        }),
        query.graph({
          entity: sellerShippingOptionLink.entryPoint,
          fields: ['seller_id', 'shipping_option_id'],
          filters: {
            shipping_option_id: input.option_ids
          }
        })
      ])

    logger.info(`[validateCartShippingOptions] sellerProducts query result: ${JSON.stringify(sellerProducts)}`)
    logger.info(`[validateCartShippingOptions] sellerShippingOptions query result: ${JSON.stringify(sellerShippingOptions)}`)

    const sellers = new Set(sellerProducts.map((sp: any) => sp.seller_id))
    logger.info(`[validateCartShippingOptions] Unique sellers from products: ${JSON.stringify(Array.from(sellers))}`)

    for (const sellerShippingOption of sellerShippingOptions) {
      logger.info(`[validateCartShippingOptions] Checking shipping option: seller_id=${sellerShippingOption.seller_id}, shipping_option_id=${sellerShippingOption.shipping_option_id}`)
      logger.info(`[validateCartShippingOptions] Is seller in sellers set? ${sellers.has(sellerShippingOption.seller_id)}`)
      if (!sellers.has(sellerShippingOption.seller_id)) {
        logger.error(`[validateCartShippingOptions] VALIDATION FAILED: Shipping option ${sellerShippingOption.shipping_option_id} seller ${sellerShippingOption.seller_id} not in sellers set ${JSON.stringify(Array.from(sellers))}`)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Shipping option with id: ${sellerShippingOption.shipping_option_id} is not available for any of the cart items`
        )
      }
    }

    logger.info(`[validateCartShippingOptions] === VALIDATION PASSED ===`)
    return new StepResponse({
      sellerProducts,
      sellerShippingOptions
    })
  }
)
