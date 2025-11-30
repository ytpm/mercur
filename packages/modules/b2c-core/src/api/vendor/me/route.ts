import { AuthenticatedMedusaRequest } from "@medusajs/framework";
import { MedusaResponse } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Interface representing a seller membership in app_metadata.
 */
interface SellerMembership {
  member_id: string;
  seller_id: string;
  role: string;
}

/**
 * @oas [get] /vendor/me
 * operationId: "VendorGetMemberMe"
 * summary: "Get Current Member"
 * description: "Retrieves the member associated with the authenticated user for the currently active seller."
 * x-authenticated: true
 * responses:
 *   "200":
 *     description: OK
 *     content:
 *       application/json:
 *         schema:
 *           type: object
 *           properties:
 *             member:
 *               $ref: "#/components/schemas/VendorMember"
 *   "401":
 *     description: Unauthorized - no active seller set
 *   "403":
 *     description: Forbidden - no membership found for active seller
 * tags:
 *   - Vendor Current Member
 * security:
 *   - api_token: []
 *   - cookie_auth: []
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const appMetadata = req.auth_context?.app_metadata;

  const activeSellerId = appMetadata?.active_seller_id;
  const memberships: SellerMembership[] = Array.isArray(appMetadata?.seller_memberships)
    ? appMetadata.seller_memberships
    : [];

  console.log(
    `[GET /vendor/me] Fetching member for active_seller_id: ${activeSellerId}`
  );

  // Validate active seller is set
  if (!activeSellerId) {
    console.error(`[GET /vendor/me] No active seller set`);
    return res.status(401).json({
      message: "No active seller set",
    });
  }

  // Find the member_id for the active seller from memberships
  const activeMembership = memberships.find(
    (m) => m.seller_id === activeSellerId
  );

  if (!activeMembership) {
    console.error(
      `[GET /vendor/me] No membership found for active seller ${activeSellerId}`
    );
    return res.status(403).json({
      message: "No membership found for active seller",
    });
  }

  console.log(
    `[GET /vendor/me] Found membership with member_id: ${activeMembership.member_id}`
  );

  // Query member by the member_id from memberships
  const {
    data: [member],
  } = await query.graph(
    {
      entity: "member",
      fields: req.queryConfig.fields,
      filters: { id: activeMembership.member_id },
    },
    { throwIfKeyNotFound: true }
  );

  res.json({ member });
};
