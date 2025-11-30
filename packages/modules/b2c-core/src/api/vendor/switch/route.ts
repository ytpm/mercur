import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";

import { VendorSwitchSellerType } from "./validators";

/**
 * Interface representing a seller membership in app_metadata.
 */
interface SellerMembership {
  member_id: string;
  seller_id: string;
  role: string;
}

/**
 * @oas [post] /vendor/switch
 * operationId: "VendorSwitchSeller"
 * summary: "Switch Active Vendor"
 * description: "Switch the active vendor context for the authenticated user. The user must be a member of the target vendor."
 * x-authenticated: true
 * requestBody:
 *   content:
 *     application/json:
 *       schema:
 *         $ref: "#/components/schemas/VendorSwitchSeller"
 * responses:
 *   "200":
 *     description: OK
 *     content:
 *       application/json:
 *         schema:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *               description: Success message
 *             active_seller_id:
 *               type: string
 *               description: The ID of the newly active seller
 *             role:
 *               type: string
 *               description: The user's role in the active vendor
 *   "401":
 *     description: Unauthorized - not authenticated
 *   "403":
 *     description: Forbidden - user is not a member of the target vendor
 * tags:
 *   - Vendor Switch
 * security:
 *   - api_token: []
 *   - cookie_auth: []
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorSwitchSellerType>,
  res: MedusaResponse
) => {
  const { seller_id } = req.validatedBody;
  const authIdentityId = req.auth_context?.auth_identity_id;

  console.log(
    `[POST /vendor/switch] Switching to seller ${seller_id} for auth ${authIdentityId}`
  );

  // Check authentication
  if (!authIdentityId) {
    console.log(`[POST /vendor/switch] No auth identity found`);
    return res.status(401).json({
      message: "Unauthorized - not authenticated",
    });
  }

  const authService = req.scope.resolve(Modules.AUTH);

  // Retrieve current auth identity
  const authIdentity = await authService.retrieveAuthIdentity(authIdentityId);
  const appMetadata = authIdentity.app_metadata || {};
  const memberships: SellerMembership[] = Array.isArray(appMetadata.seller_memberships)
    ? appMetadata.seller_memberships
    : [];

  console.log(
    `[POST /vendor/switch] Found ${memberships.length} memberships for user`
  );

  // Validate user has access to requested seller
  const membership = memberships.find((m) => m.seller_id === seller_id);

  if (!membership) {
    console.log(
      `[POST /vendor/switch] User is not a member of seller ${seller_id}`
    );
    return res.status(403).json({
      message: "Forbidden - you are not a member of this vendor",
    });
  }

  // Update active_seller_id
  appMetadata.active_seller_id = seller_id;

  await authService.updateAuthIdentities([
    {
      id: authIdentity.id,
      app_metadata: appMetadata,
    },
  ]);

  console.log(
    `[POST /vendor/switch] Successfully switched to seller ${seller_id} with role ${membership.role}`
  );

  return res.status(200).json({
    message: "Vendor context switched successfully",
    active_seller_id: seller_id,
    role: membership.role,
  });
};
