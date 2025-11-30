import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import { SellerDTO } from "@mercurjs/framework";

/**
 * Fetches the seller using active_seller_id from app_metadata.
 *
 * BEFORE (single-vendor): Queried DB to find seller by member ID
 * AFTER (multi-vendor): Reads active_seller_id directly from app_metadata
 *
 * @param appMetadata - The app_metadata from auth_context
 * @param scope - MedusaContainer for resolving services
 * @param fields - Fields to return (default: ['id'])
 * @returns The seller DTO
 * @throws Error if no active seller is set or seller is not found
 */
export const fetchSellerByAuthContext = async (
  appMetadata: Record<string, any>,
  scope: MedusaContainer,
  fields: string[] = ["id"]
): Promise<SellerDTO> => {
  const activeSellerId = appMetadata?.active_seller_id;

  console.log(
    `[fetchSellerByAuthContext] Fetching seller with active_seller_id: ${activeSellerId}`
  );

  if (!activeSellerId) {
    console.error(`[fetchSellerByAuthContext] No active seller set in app_metadata`);
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "No active seller set in app_metadata"
    );
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    filters: {
      id: activeSellerId, // Direct lookup by seller ID
    },
    fields,
  });

  if (!seller) {
    console.error(`[fetchSellerByAuthContext] Seller ${activeSellerId} not found`);
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Seller ${activeSellerId} not found`
    );
  }

  console.log(`[fetchSellerByAuthContext] Found seller: ${seller.id}`);
  return seller;
};

/**
 * @deprecated Use fetchSellerByAuthContext instead.
 * Keep this function as an alias for backwards compatibility during migration.
 *
 * IMPORTANT: This function signature changed!
 * - Before: fetchSellerByAuthActorId(actorId, scope, fields)
 * - After: fetchSellerByAuthActorId(appMetadata, scope, fields)
 *
 * This is intentional to catch any usages that need to be updated.
 */
export const fetchSellerByAuthActorId = fetchSellerByAuthContext;
