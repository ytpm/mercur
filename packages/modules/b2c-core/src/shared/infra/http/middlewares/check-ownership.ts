import { NextFunction } from "express";

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";

/**
 * Interface representing a seller membership in app_metadata.
 */
interface SellerMembership {
  member_id: string;
  seller_id: string;
  role: string;
}

type CheckResourceOwnershipByResourceIdOptions<Body> = {
  entryPoint: string;
  filterField?: string;
  resourceId?: (req: AuthenticatedMedusaRequest<Body>) => string;
};

/**
 * Middleware that verifies if the authenticated member owns/has access to the requested resource.
 *
 * BEFORE (single-vendor): Queried member by actor_id, compared member.seller.id with resource.seller_id
 * AFTER (multi-vendor): Uses active_seller_id from app_metadata, validates user has membership
 *
 * @param options - Configuration options for the ownership check
 * @param options.entryPoint - The entity type to verify ownership of (e.g. 'seller_product', 'service_zone')
 * @param options.filterField - Field used to filter/lookup the resource (defaults to 'id')
 * @param options.resourceId - Function to extract resource ID from request (defaults to req.params.id)
 *
 * @throws {MedusaError} If the member does not own the resource
 *
 * @example
 * // Basic usage - check ownership of vendor product
 * app.use(checkResourceOwnershipByResourceId({
 *   entryPoint: 'seller_product'
 * }))
 *
 * @example
 * // Custom field usage - check ownership of service zone
 * app.use(checkResourceOwnershipByResourceId({
 *   entryPoint: 'service_zone',
 *   filterField: 'service_zone_id',
 *   resourceId: (req) => req.params.zone_id
 * }))
 */
export const checkResourceOwnershipByResourceId = <Body>({
  entryPoint,
  filterField = "id",
  resourceId = (req) => req.params.id,
}: CheckResourceOwnershipByResourceIdOptions<Body>) => {
  return async (
    req: AuthenticatedMedusaRequest<Body>,
    res: MedusaResponse,
    next: NextFunction
  ) => {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const authIdentityId = req.auth_context?.auth_identity_id;
    let appMetadata = req.auth_context?.app_metadata || {};

    // Get active seller from app_metadata (may be missing in JWT)
    let activeSellerId = appMetadata?.active_seller_id;

    // If no active_seller_id in JWT app_metadata, fetch fresh from database
    // JWT tokens only contain partial app_metadata (seller_id), not the full
    // multi-vendor data (active_seller_id, seller_memberships[])
    if (!activeSellerId && authIdentityId) {
      console.log(
        `[checkResourceOwnershipByResourceId] No active_seller_id in JWT, fetching from DB for auth_identity: ${authIdentityId}`
      );
      const authService = req.scope.resolve(Modules.AUTH);
      const authIdentity = await authService.retrieveAuthIdentity(authIdentityId);
      appMetadata = authIdentity?.app_metadata || {};
      activeSellerId = appMetadata?.active_seller_id;
    }

    console.log(
      `[checkResourceOwnershipByResourceId] Checking ownership for active_seller_id: ${activeSellerId}`
    );

    if (!activeSellerId) {
      console.error(
        `[checkResourceOwnershipByResourceId] No active seller set`
      );
      res.status(401).json({
        message: "No active seller set",
        type: MedusaError.Types.UNAUTHORIZED,
      });
      return;
    }

    // Validate user has membership to active seller (security check)
    const memberships: SellerMembership[] = Array.isArray(appMetadata?.seller_memberships)
      ? appMetadata.seller_memberships
      : [];
    const hasMembership = memberships.some(
      (m) => m.seller_id === activeSellerId
    );

    if (!hasMembership) {
      console.error(
        `[checkResourceOwnershipByResourceId] User is not a member of active seller ${activeSellerId}`
      );
      res.status(403).json({
        message: "You are not a member of the active seller",
        type: MedusaError.Types.NOT_ALLOWED,
      });
      return;
    }

    // Fetch the resource
    const id = resourceId(req);

    const {
      data: [resource],
    } = await query.graph({
      entity: entryPoint,
      fields: ["seller_id"],
      filters: {
        [filterField]: id,
      },
    });

    if (!resource) {
      console.log(
        `[checkResourceOwnershipByResourceId] Resource ${entryPoint} with ${filterField}: ${id} not found`
      );
      res.status(404).json({
        message: `${entryPoint} with ${filterField}: ${id} not found`,
        type: MedusaError.Types.NOT_FOUND,
      });
      return;
    }

    // Compare resource's seller_id with active_seller_id
    if (activeSellerId !== resource.seller_id) {
      console.log(
        `[checkResourceOwnershipByResourceId] Access denied. active_seller_id: ${activeSellerId}, resource.seller_id: ${resource.seller_id}`
      );
      res.status(403).json({
        message: "You are not allowed to perform this action",
        type: MedusaError.Types.NOT_ALLOWED,
      });
      return;
    }

    console.log(
      `[checkResourceOwnershipByResourceId] Access granted for resource ${id}`
    );
    next();
  };
};
