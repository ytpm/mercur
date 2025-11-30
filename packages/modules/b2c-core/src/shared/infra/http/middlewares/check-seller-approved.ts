import { NextFunction } from 'express'

import {
  AuthType,
  ConfigModule,
  MedusaRequest,
  MedusaResponse,
  getAuthContextFromJwtToken
} from '@medusajs/framework'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'

/**
 * Interface representing a seller membership in app_metadata.
 */
interface SellerMembership {
  member_id: string
  seller_id: string
  role: string
}

/**
 * Middleware to check if the seller is approved/active.
 *
 * Supports both:
 * - New multi-vendor format: active_seller_id + seller_memberships[]
 * - Old single-vendor format: actor_id (backwards compatibility)
 */
export function checkSellerApproved(authTypes: AuthType[]) {
  return async (
    req: MedusaRequest,
    res: MedusaResponse,
    next: NextFunction
  ) => {
    const {
      projectConfig: { http }
    } = req.scope.resolve<ConfigModule>(ContainerRegistrationKeys.CONFIG_MODULE)

    const ctx = getAuthContextFromJwtToken(
      req.headers.authorization,
      http.jwtSecret!,
      authTypes,
      ['seller']
    )

    if (!ctx) {
      console.log('[checkSellerApproved] No auth context found')
      return res.status(401).json({
        message: 'Unauthorized'
      })
    }

    // Fetch fresh app_metadata from database since JWT only contains partial data
    // The JWT token only includes seller_id, not active_seller_id or seller_memberships[]
    let appMetadata: Record<string, unknown> = {}
    if (ctx.auth_identity_id) {
      try {
        const authService = req.scope.resolve(Modules.AUTH)
        const authIdentity = await authService.retrieveAuthIdentity(ctx.auth_identity_id)
        appMetadata = authIdentity?.app_metadata || {}
        console.log(`[checkSellerApproved] Fetched app_metadata for auth_identity ${ctx.auth_identity_id}`)
      } catch (err) {
        console.error(`[checkSellerApproved] Failed to fetch auth_identity: ${err}`)
      }
    }

    // Check for new multi-vendor format: active_seller_id with memberships
    const activeSellerId = appMetadata.active_seller_id as string | undefined
    const memberships: SellerMembership[] = Array.isArray(appMetadata.seller_memberships)
      ? appMetadata.seller_memberships
      : []

    if (activeSellerId && memberships.length > 0) {
      // Verify user has membership for active seller
      const hasActiveMembership = memberships.some(
        (m) => m.seller_id === activeSellerId
      )
      if (hasActiveMembership) {
        console.log(`[checkSellerApproved] Approved via multi-vendor: active_seller_id=${activeSellerId}`)
        return next()
      }
    }

    // Fallback: Check old actor_id format (backwards compatibility)
    if (ctx.actor_id) {
      console.log(`[checkSellerApproved] Approved via legacy actor_id=${ctx.actor_id}`)
      return next()
    }

    console.log('[checkSellerApproved] Seller is not active - no valid membership or actor_id')
    res.status(403).json({
      message: 'Seller is not active'
    })
  }
}
