import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { fetchSellerByAuthContext } from "../../../../shared/infra/http/utils/seller";
import { updateSellerWorkflow } from "../../../../workflows/seller/workflows";
import { VendorUpdateSellerType } from "../validators";

/**
 * @oas [get] /vendor/sellers/me
 * operationId: "VendorGetSellerMe"
 * summary: "Get Current Seller"
 * description: "Retrieves the seller associated with the authenticated user for the active vendor context."
 * x-authenticated: true
 * responses:
 *   "200":
 *     description: OK
 *     content:
 *       application/json:
 *         schema:
 *           type: object
 *           properties:
 *             seller:
 *               $ref: "#/components/schemas/VendorSeller"
 * tags:
 *   - Vendor Sellers
 * security:
 *   - api_token: []
 *   - cookie_auth: []
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const appMetadata = req.auth_context?.app_metadata;
  const authIdentityId = req.auth_context?.auth_identity_id;

  console.log(
    `[GET /vendor/sellers/me] Fetching seller for active_seller_id: ${appMetadata?.active_seller_id}, auth_identity_id: ${authIdentityId}`
  );

  const seller = await fetchSellerByAuthContext(
    appMetadata,
    req.scope,
    req.queryConfig.fields,
    authIdentityId
  );

  res.json({ seller });
};

/**
 * @oas [post] /vendor/sellers/me
 * operationId: "VendorUpdateSellerMe"
 * summary: "Update Current Seller"
 * description: "Updates the seller associated with the authenticated user for the active vendor context."
 * x-authenticated: true
 * requestBody:
 *   content:
 *     application/json:
 *       schema:
 *         $ref: "#/components/schemas/VendorUpdateSeller"
 * responses:
 *   "200":
 *     description: OK
 *     content:
 *       application/json:
 *         schema:
 *           type: object
 *           properties:
 *             seller:
 *               $ref: "#/components/schemas/VendorSeller"
 * tags:
 *   - Vendor Sellers
 * security:
 *   - api_token: []
 *   - cookie_auth: []
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateSellerType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const appMetadata = req.auth_context?.app_metadata;
  const authIdentityId = req.auth_context?.auth_identity_id;

  console.log(
    `[POST /vendor/sellers/me] Updating seller for active_seller_id: ${appMetadata?.active_seller_id}, auth_identity_id: ${authIdentityId}`
  );

  const { id } = await fetchSellerByAuthContext(appMetadata, req.scope, ["id"], authIdentityId);

  await updateSellerWorkflow(req.scope).run({
    input: {
      id,
      ...req.validatedBody,
    },
  });

  const {
    data: [seller],
  } = await query.graph(
    {
      entity: "seller",
      fields: req.queryConfig.fields,
      filters: { id },
    },
    { throwIfKeyNotFound: true }
  );

  res.json({ seller });
};
