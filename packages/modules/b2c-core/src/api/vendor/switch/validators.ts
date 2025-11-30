import { z } from "zod";

/**
 * @schema VendorSwitchSeller
 * type: object
 * required:
 *   - seller_id
 * properties:
 *   seller_id:
 *     type: string
 *     description: The ID of the seller/vendor to switch to.
 */
export type VendorSwitchSellerType = z.infer<typeof VendorSwitchSeller>;

export const VendorSwitchSeller = z
  .object({
    seller_id: z.string().min(1, "seller_id is required"),
  })
  .strict();
