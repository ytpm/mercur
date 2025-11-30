import { NextFunction } from "express";

import { AuthenticatedMedusaRequest } from "@medusajs/framework/http";

import { fetchSellerByAuthContext } from "../utils/seller";

/**
 * Middleware that adds seller_id to filterable fields.
 *
 * BEFORE: Used actor_id (member.id) to look up seller
 * AFTER: Uses app_metadata.active_seller_id directly
 *
 * This enables multi-vendor support where a user can have
 * multiple memberships and filter by the currently active one.
 */
export function filterBySellerId() {
  return async (req: AuthenticatedMedusaRequest, _, next: NextFunction) => {
    const appMetadata = req.auth_context?.app_metadata;

    console.log(
      `[filterBySellerId] Fetching seller for active_seller_id: ${appMetadata?.active_seller_id}`
    );

    const seller = await fetchSellerByAuthContext(appMetadata, req.scope);

    req.filterableFields.seller_id = seller.id;

    return next();
  };
}
