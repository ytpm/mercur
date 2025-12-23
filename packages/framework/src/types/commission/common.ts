import { BigNumberValue } from '@medusajs/framework/types'

export type CommissionRateDTO = {
  id: string
  created_at: Date
  updated_at: Date
  type: string
  percentage_rate: number | null
  include_tax: boolean
  price_set_id: string | null
  max_price_set_id: string | null
  min_price_set_id: string | null
}

export type CommissionRuleDTO = {
  id: string
  created_at: Date
  updated_at: Date
  name: string
  reference: string
  reference_id: string
  rate: CommissionRateDTO
}

export type CommissionLineDTO = {
  id: string
  item_line_id: string
  rule_id: string
  currency_code: string
  value: BigNumberValue
  created_at: Date
  updated_at: Date
}

/**
 * Context for commission calculation.
 * Used to determine which commission rule applies to a product line item.
 */
export type CommissionCalculationContext = {
  /** The product/event ID - required for event-level commission override */
  product_id: string
  /** The product type ID */
  product_type_id: string
  /** The product category ID */
  product_category_id: string
  /** The seller/vendor ID */
  seller_id: string
}

type Price = { amount: number; currency_code: string }

export type AdminCommissionAggregate = {
  id: string
  name: string
  type: string
  reference: string
  reference_id: string
  include_tax: boolean
  is_active: boolean
  ref_value: string
  price_set_id: string | null
  price_set: Price[]
  min_price_set_id: string | null
  min_price_set: Price[]
  max_price_set_id: string | null
  max_price_set: Price[]
  percentage_rate: number | null
  fee_value: string
}
