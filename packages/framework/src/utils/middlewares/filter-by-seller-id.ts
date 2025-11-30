import { NextFunction } from "express";

import { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";

import { fetchSellerFromRequest } from "../seller";

/**
 * Adds a seller id to the filterable fields.
 * Supports multi-vendor by using active_seller_id from app_metadata.
 */
export function filterBySellerId() {
  return async (req: AuthenticatedMedusaRequest, _, next: NextFunction) => {
    const seller = await fetchSellerFromRequest(req);

    if (!seller) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "No active seller found"
      );
    }

    req.filterableFields.seller_id = seller.id;

    return next();
  };
}
