import { AuthenticatedMedusaRequest, MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { SellerDTO } from "../types";

/**
 * Fetches fresh app_metadata from the database.
 * JWT tokens only contain partial app_metadata (seller_id), not the full
 * multi-vendor data (active_seller_id, seller_memberships[]).
 *
 * @param authIdentityId - The auth_identity_id from JWT claims
 * @param scope - MedusaContainer for resolving services
 * @returns The full app_metadata from the database
 */
const fetchFreshAppMetadata = async (
  authIdentityId: string,
  scope: MedusaContainer
): Promise<Record<string, any>> => {
  const authService = scope.resolve(Modules.AUTH);
  const authIdentity = await authService.retrieveAuthIdentity(authIdentityId);
  return authIdentity?.app_metadata || {};
};

/**
 * @deprecated Use fetchSellerFromRequest instead.
 * This function uses the old single-vendor approach with actor_id.
 */
export const fetchSellerByAuthActorId = async (
  authActorId: string,
  scope: MedusaContainer,
  fields: string[] = ["id"]
): Promise<SellerDTO> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    filters: {
      members: {
        id: authActorId,
      },
    },
    fields,
  });
  return seller;
};

/**
 * Fetches the seller using active_seller_id from app_metadata.
 * Supports multi-vendor by reading active_seller_id from database.
 *
 * @param appMetadata - The app_metadata from auth_context (may be partial from JWT)
 * @param scope - MedusaContainer for resolving services
 * @param fields - Fields to return (default: ['id'])
 * @param authIdentityId - Optional auth_identity_id to fetch fresh app_metadata from DB
 * @returns The seller DTO or undefined if not found
 */
export const fetchSellerByAuthContext = async (
  appMetadata: Record<string, any>,
  scope: MedusaContainer,
  fields: string[] = ["id"],
  authIdentityId?: string
): Promise<SellerDTO | undefined> => {
  let activeSellerId = appMetadata?.active_seller_id;

  // If no active_seller_id in JWT app_metadata, fetch fresh from database
  if (!activeSellerId && authIdentityId) {
    console.log(
      `[framework:fetchSellerByAuthContext] No active_seller_id in JWT, fetching from DB for auth_identity: ${authIdentityId}`
    );
    const freshAppMetadata = await fetchFreshAppMetadata(authIdentityId, scope);
    activeSellerId = freshAppMetadata?.active_seller_id;
  }

  if (!activeSellerId) {
    console.log(`[framework:fetchSellerByAuthContext] No active_seller_id found`);
    return undefined;
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY);

  console.log(`[framework:fetchSellerByAuthContext] Querying seller with id: ${activeSellerId}`);

  const result = await query.graph({
    entity: "seller",
    filters: {
      id: activeSellerId,
    },
    fields,
  });

  console.log(`[framework:fetchSellerByAuthContext] Query result:`, JSON.stringify(result));

  const seller = result.data?.[0];

  if (!seller) {
    console.error(`[framework:fetchSellerByAuthContext] Seller ${activeSellerId} not found in database`);
    return undefined;
  }

  console.log(`[framework:fetchSellerByAuthContext] Found seller: ${seller.id}`);
  return seller;
};

/**
 * Convenience function that extracts auth context from request and fetches the seller.
 * This is the recommended way to get the current seller in route handlers.
 *
 * @param req - The authenticated request object
 * @param fields - Fields to return (default: ['id'])
 * @returns The seller DTO or undefined if not found
 */
export const fetchSellerFromRequest = async (
  req: AuthenticatedMedusaRequest,
  fields: string[] = ["id"]
): Promise<SellerDTO | undefined> => {
  const appMetadata = req.auth_context?.app_metadata || {};
  const authIdentityId = req.auth_context?.auth_identity_id;

  return fetchSellerByAuthContext(appMetadata, req.scope, fields, authIdentityId);
};
