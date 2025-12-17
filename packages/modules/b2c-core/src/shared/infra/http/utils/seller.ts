import { AuthenticatedMedusaRequest, MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";

import { SellerDTO } from "@mercurjs/framework";

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
 * Fetches the seller using active_seller_id from app_metadata.
 *
 * BEFORE (single-vendor): Queried DB to find seller by member ID
 * AFTER (multi-vendor): Reads active_seller_id directly from app_metadata
 *
 * NOTE: If active_seller_id is not in the provided appMetadata (JWT only has partial data),
 * and authIdentityId is provided, this function will fetch fresh app_metadata from the database.
 *
 * @param appMetadata - The app_metadata from auth_context (may be partial from JWT)
 * @param scope - MedusaContainer for resolving services
 * @param fields - Fields to return (default: ['id'])
 * @param authIdentityId - Optional auth_identity_id to fetch fresh app_metadata from DB
 * @returns The seller DTO
 * @throws Error if no active seller is set or seller is not found
 */
export const fetchSellerByAuthContext = async (
  appMetadata: Record<string, any>,
  scope: MedusaContainer,
  fields: string[] = ["id"],
  authIdentityId?: string
): Promise<SellerDTO> => {
  let activeSellerId = appMetadata?.active_seller_id;

  // If no active_seller_id in JWT app_metadata, fetch fresh from database
  if (!activeSellerId && authIdentityId) {
    console.log(
      `[fetchSellerByAuthContext] No active_seller_id in JWT, fetching from DB for auth_identity: ${authIdentityId}`
    );
    const freshAppMetadata = await fetchFreshAppMetadata(authIdentityId, scope);
    activeSellerId = freshAppMetadata?.active_seller_id;
  }

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

  // Ensure 'id' is always included in fields for proper seller identification
  const queryFields = fields.includes("id") ? fields : ["id", ...fields];

  console.log(`[fetchSellerByAuthContext] Querying seller with id: ${activeSellerId}, fields: ${JSON.stringify(queryFields)}`);

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    filters: {
      id: activeSellerId, // Direct lookup by seller ID
    },
    fields: queryFields,
  });

  console.log(`[fetchSellerByAuthContext] Query result seller:`, JSON.stringify(seller));

  if (!seller) {
    console.error(`[fetchSellerByAuthContext] Seller ${activeSellerId} not found in database`);
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

/**
 * Convenience function that extracts auth context from request and fetches the seller.
 * This is the recommended way to get the current seller in route handlers.
 *
 * @param req - The authenticated request object
 * @param fields - Fields to return (default: ['id'])
 * @returns The seller DTO
 */
export const fetchSellerFromRequest = async (
  req: AuthenticatedMedusaRequest,
  fields: string[] = ["id"]
): Promise<SellerDTO> => {
  const appMetadata = req.auth_context?.app_metadata || {};
  const authIdentityId = req.auth_context?.auth_identity_id;

  return fetchSellerByAuthContext(appMetadata, req.scope, fields, authIdentityId);
};
