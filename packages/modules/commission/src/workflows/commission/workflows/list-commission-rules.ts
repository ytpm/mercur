import {
  WorkflowResponse,
  createWorkflow,
  transform
} from '@medusajs/workflows-sdk'

import { AdminCommissionAggregate } from '@ytpm/mercurjs-framework'

import { findCommissionRulesStep } from '../steps'
import { findCommissionReferencesStep } from '../steps/find-commission-references'

export const listCommissionRulesWorkflow = createWorkflow(
  'list-commission-rules',
  function (input: {
    pagination?: {
      skip: number
      take?: number
      order?: Record<string, any>
    }
    ids?: string[]
    /** Filter by reference type */
    reference?: string
    /** Filter by reference ID */
    reference_id?: string
  }) {
    const data = findCommissionRulesStep(input)
    const references = findCommissionReferencesStep(data.commission_rules)

    const result = transform({ data, references }, ({ data, references }) => {
      return data.commission_rules.map((rule) => {
        let ref_value = ''

        if (rule.reference === 'seller') {
          ref_value = references.sellers.find(
            (ref) => ref.id === rule.reference_id
          )?.value || rule.reference_id
        }

        // Event-level commission (global)
        if (rule.reference === 'product') {
          ref_value = references.products?.find(
            (ref) => ref.id === rule.reference_id
          )?.value || rule.reference_id
        }

        if (rule.reference === 'product_type') {
          ref_value = references.productTypes.find(
            (ref) => ref.id === rule.reference_id
          )?.value || rule.reference_id
        }

        if (rule.reference === 'product_category') {
          ref_value = references.productCategories.find(
            (ref) => ref.id === rule.reference_id
          )?.value || rule.reference_id
        }

        if (rule.reference === 'seller+product_category') {
          const ids = rule.reference_id.split('+')
          const sellerName = references.sellers.find((ref) => ref.id === ids[0])?.value || ids[0]
          const categoryName = references.productCategories.find((ref) => ref.id === ids[1])?.value || ids[1]
          ref_value = sellerName + ' + ' + categoryName
        }

        if (rule.reference === 'seller+product_type') {
          const ids = rule.reference_id.split('+')
          const sellerName = references.sellers.find((ref) => ref.id === ids[0])?.value || ids[0]
          const typeName = references.productTypes.find((ref) => ref.id === ids[1])?.value || ids[1]
          ref_value = sellerName + ' + ' + typeName
        }

        // Event-level commission override for a vendor (highest priority)
        if (rule.reference === 'seller+product') {
          const ids = rule.reference_id.split('+')
          const sellerName = references.sellers.find((ref) => ref.id === ids[0])?.value || ids[0]
          const productName = references.products?.find((ref) => ref.id === ids[1])?.value || ids[1]
          ref_value = sellerName + ' + ' + productName
        }

        return {
          ...rule,
          ref_value
        }
      })
    })

    return new WorkflowResponse({
      commission_rules: result as AdminCommissionAggregate[],
      count: data.count
    })
  }
)
