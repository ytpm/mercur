import { StepResponse, createStep } from '@medusajs/framework/workflows-sdk'

type StepInput = Array<{ reference: string; reference_id: string }>

/**
 * Step to find display names for commission rule references.
 * Queries the database to get human-readable names for sellers, products, product types, and categories.
 */
export const findCommissionReferencesStep = createStep(
  'find-commission-references',
  async (input: StepInput, { container }) => {
    console.log('[findCommissionReferencesStep] Processing input:', input.length, 'rules')

    const knex = container.resolve('__pg_connection__')

    // Collect IDs for each reference type
    const sellerIds = input
      .filter((i) => i.reference === 'seller')
      .map((v) => v.reference_id)
    const productIds = input
      .filter((i) => i.reference === 'product')
      .map((v) => v.reference_id)
    const productTypeIds = input
      .filter((i) => i.reference === 'product_type')
      .map((v) => v.reference_id)
    const productCategoryIds = input
      .filter((i) => i.reference === 'product_category')
      .map((v) => v.reference_id)

    // Handle combined seller+product_type and seller+product_category references
    input
      .filter(
        (i) =>
          i.reference === 'seller+product_type' ||
          i.reference === 'seller+product_category'
      )
      .forEach((v) => {
        const ids = v.reference_id.split('+')
        sellerIds.push(ids[0])
        if (v.reference === 'seller+product_category') {
          productCategoryIds.push(ids[1])
        } else {
          productTypeIds.push(ids[1])
        }
      })

    // Handle combined seller+product references (event-level commission override)
    input
      .filter((i) => i.reference === 'seller+product')
      .forEach((v) => {
        const ids = v.reference_id.split('+')
        sellerIds.push(ids[0])
        productIds.push(ids[1])
      })

    console.log('[findCommissionReferencesStep] Unique IDs to fetch:', {
      sellers: [...new Set(sellerIds)].length,
      products: [...new Set(productIds)].length,
      productTypes: [...new Set(productTypeIds)].length,
      productCategories: [...new Set(productCategoryIds)].length,
    })

    // Query database for display names
    const sellers = await knex('seller')
      .select(['id', 'name AS value'])
      .whereIn('id', [...new Set(sellerIds)])

    const products = await knex('product')
      .select(['id', 'title AS value'])
      .whereIn('id', [...new Set(productIds)])

    const productTypes = await knex('product_type')
      .select(['id', 'value'])
      .whereIn('id', [...new Set(productTypeIds)])

    const productCategories = await knex('product_category')
      .select(['id', 'name AS value'])
      .whereIn('id', [...new Set(productCategoryIds)])

    console.log('[findCommissionReferencesStep] Fetched display names:', {
      sellers: sellers.length,
      products: products.length,
      productTypes: productTypes.length,
      productCategories: productCategories.length,
    })

    return new StepResponse({ sellers, products, productTypes, productCategories })
  }
)
