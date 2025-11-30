import { NextFunction } from "express";

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";

import { StoreStatus } from "@mercurjs/framework";

import { fetchSellerByAuthContext } from "../utils/seller";

/**
 * Middleware that checks store status and request method to determine access.
 * - Allows all operations if store status is ACTIVE
 * - Allows GET operations for any store status
 * - Blocks all other operations with 403 Forbidden
 *
 * MODIFIED for multi-vendor: Uses app_metadata.active_seller_id
 */
export const storeActiveGuard = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: NextFunction
) => {
  const appMetadata = req.auth_context?.app_metadata;

  console.log(
    `[storeActiveGuard] Checking store status for active_seller_id: ${appMetadata?.active_seller_id}`
  );

  const seller = await fetchSellerByAuthContext(appMetadata, req.scope, [
    "store_status",
  ]);

  const isActiveStore = seller.store_status === StoreStatus.ACTIVE;
  const isGetRequest = req.method === "GET";

  if (isActiveStore || isGetRequest) {
    return next();
  }

  console.log(
    `[storeActiveGuard] Blocking non-GET request for inactive store`
  );

  return res.status(403).json({
    message: "Operation not allowed for current store status",
  });
};
