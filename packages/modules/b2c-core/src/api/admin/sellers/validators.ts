import { z } from 'zod'

import { createFindParams } from '@medusajs/medusa/api/utils/validators'

import { StoreStatus, SellerPaymentMode } from '@mercurjs/framework'

export type AdminSellerParamsType = z.infer<typeof AdminSellerParams>
export const AdminSellerParams = createFindParams({
  offset: 0,
  limit: 50
})

export type AdminGetSellerProductsParamsType = z.infer<
  typeof AdminGetSellerProductsParams
>
export const AdminGetSellerProductsParams = createFindParams({
  offset: 0,
  limit: 50
})

export type AdminGetSellerOrdersParamsType = z.infer<
  typeof AdminGetSellerOrdersParams
>
export const AdminGetSellerOrdersParams = createFindParams({
  offset: 0,
  limit: 50
})

export type AdminGetSellerCustomerGroupsParamsType = z.infer<
  typeof AdminGetSellerCustomerGroupsParams
>
export const AdminGetSellerCustomerGroupsParams = createFindParams({
  offset: 0,
  limit: 50
})

export type AdminUpdateSellerType = z.infer<typeof AdminUpdateSeller>
/**
 * Validator for admin seller update requests.
 * Uses .passthrough() to allow extended fields from custom implementations.
 */
export const AdminUpdateSeller = z
  .object({
    name: z
      .preprocess((val: string) => val.trim(), z.string().min(4))
      .optional(),
    description: z.string().optional(),
    photo: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address_line: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country_code: z.string().optional(),
    tax_id: z.string().optional(),
    store_status: z.nativeEnum(StoreStatus).optional(),
    // Extended contact person fields
    contact_first_name: z.string().optional(),
    contact_last_name: z.string().optional(),
    contact_email: z.string().email().optional(),
    contact_phone: z.string().optional(),
    // Payment mode for seller payout configuration
    payment_mode: z.nativeEnum(SellerPaymentMode).optional()
  })
  .passthrough()

export type AdminInviteSellerType = z.infer<typeof AdminInviteSeller>
export const AdminInviteSeller = z.object({
  email: z.string().email(),
  registration_url: z.string().default('http://localhost:5173/register')
})
