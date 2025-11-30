import { MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework";

import { VendorSwitchSeller } from "./validators";

/**
 * Middlewares for the vendor switch endpoint.
 * Validates the request body for switching active vendor.
 */
export const vendorSwitchMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/switch",
    method: ["POST"],
    middlewares: [validateAndTransformBody(VendorSwitchSeller)],
  },
];
