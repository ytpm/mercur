import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

import { SELLER_MODULE, SellerModuleService } from "../../../modules/seller";

/**
 * Interface representing a seller membership in app_metadata.
 */
interface SellerMembership {
  member_id: string;
  seller_id: string;
  role: string;
}

/**
 * Interface for enriched membership data returned to the client.
 */
interface EnrichedMembership {
  member_id: string;
  seller_id: string;
  seller_name: string;
  seller_logo: string | null;
  role: string;
  is_active: boolean;
}

/**
 * @oas [get] /vendor/memberships
 * operationId: "VendorGetMemberships"
 * summary: "Get All Vendor Memberships"
 * description: "Get all vendor memberships for the authenticated user. Returns enriched data including seller name and logo."
 * x-authenticated: true
 * responses:
 *   "200":
 *     description: OK
 *     content:
 *       application/json:
 *         schema:
 *           type: object
 *           properties:
 *             memberships:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   member_id:
 *                     type: string
 *                     description: The ID of the member record
 *                   seller_id:
 *                     type: string
 *                     description: The ID of the seller/vendor
 *                   seller_name:
 *                     type: string
 *                     description: The name of the seller/vendor
 *                   seller_logo:
 *                     type: string
 *                     nullable: true
 *                     description: The logo URL of the seller/vendor
 *                   role:
 *                     type: string
 *                     description: The user's role in this vendor
 *                   is_active:
 *                     type: boolean
 *                     description: Whether this is the currently active vendor
 *             active_seller_id:
 *               type: string
 *               nullable: true
 *               description: The ID of the currently active seller
 *   "401":
 *     description: Unauthorized - not authenticated
 * tags:
 *   - Vendor Memberships
 * security:
 *   - api_token: []
 *   - cookie_auth: []
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const authIdentityId = req.auth_context?.auth_identity_id;

  console.log(
    `[GET /vendor/memberships] Fetching memberships for auth ${authIdentityId}`
  );

  // Check authentication
  if (!authIdentityId) {
    console.log(`[GET /vendor/memberships] No auth identity found`);
    return res.status(401).json({
      message: "Unauthorized - not authenticated",
    });
  }

  const authService = req.scope.resolve(Modules.AUTH);
  const sellerService = req.scope.resolve<SellerModuleService>(SELLER_MODULE);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  // Retrieve current auth identity
  const authIdentity = await authService.retrieveAuthIdentity(authIdentityId);
  const appMetadata = authIdentity.app_metadata || {};
  const memberships: SellerMembership[] = Array.isArray(appMetadata.seller_memberships)
    ? appMetadata.seller_memberships
    : [];
  const activeSellerId = appMetadata.active_seller_id;

  console.log(
    `[GET /vendor/memberships] Found ${memberships.length} memberships, active_seller_id: ${activeSellerId}`
  );

  // Enrich with seller details (name, logo)
  // Filter out memberships where the seller no longer exists (edge case: seller was deleted)
  const enrichedMemberships: EnrichedMembership[] = [];

  for (const m of memberships) {
    try {
      // Query seller details using query.graph
      const {
        data: [seller],
      } = await query.graph({
        entity: "seller",
        fields: ["id", "name", "photo"],
        filters: { id: m.seller_id },
      });

      if (seller) {
        enrichedMemberships.push({
          member_id: m.member_id,
          seller_id: m.seller_id,
          seller_name: seller.name,
          seller_logo: seller.photo || null,
          role: m.role,
          is_active: m.seller_id === activeSellerId,
        });
      } else {
        console.warn(
          `[GET /vendor/memberships] Seller ${m.seller_id} not found, skipping stale membership`
        );
      }
    } catch (error) {
      // Seller was deleted or query failed - skip this membership
      console.warn(
        `[GET /vendor/memberships] Error fetching seller ${m.seller_id}, skipping stale membership:`,
        error
      );
    }
  }

  console.log(
    `[GET /vendor/memberships] Returning ${enrichedMemberships.length} enriched memberships`
  );

  return res.status(200).json({
    memberships: enrichedMemberships,
    active_seller_id: activeSellerId || null,
  });
};
