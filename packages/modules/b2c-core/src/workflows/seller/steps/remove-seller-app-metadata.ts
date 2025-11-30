import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * Interface representing a seller membership in app_metadata.
 */
interface SellerMembership {
  member_id: string;
  seller_id: string;
  role: string;
}

/**
 * Result returned when membership is removed.
 */
export interface RemoveResult {
  /** Whether a membership was removed */
  removed: boolean;
  /** Whether the user should be logged out (no vendors left) */
  shouldLogout?: boolean;
  /** The new active seller ID after removal */
  newActiveSellerId?: string;
  /** Whether this was an orphaned member (no auth_identity found) */
  orphaned?: boolean;
}

/**
 * Compensation data for rollback if workflow fails.
 */
interface CompensationData {
  /** The auth identity ID that was modified */
  authIdentityId: string;
  /** The membership that was removed */
  removedMembership: SellerMembership;
  /** The memberships array before the removal */
  previousMemberships: SellerMembership[];
  /** The active seller ID before removal */
  previousActiveSellerId: string;
}

/**
 * Step ID for the remove seller app metadata step.
 */
export const removeSellerAppMetadataStepId = "remove-seller-app-metadata";

/**
 * Step to remove a vendor membership from app_metadata when member is deleted.
 * Handles auto-switching active_seller_id or flagging logout if no vendors remain.
 *
 * NOTE: This step looks up the auth_identity by scanning for the member_id
 * in seller_memberships[], since there's no direct member → auth_identity link.
 *
 * @param memberId - The member ID (string) - matches MercurJS workflow pattern
 */
export const removeSellerAppMetadataStep = createStep(
  removeSellerAppMetadataStepId,
  async (memberId: string, { container }) => {
    const authService = container.resolve(Modules.AUTH);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    console.log(
      `[removeSellerAppMetadataStep] Removing membership for member ${memberId}`
    );

    // First, get the member to find their seller_id
    const {
      data: [member],
    } = await query.graph({
      entity: "member",
      fields: ["id", "seller_id"],
      filters: { id: memberId },
    });

    if (!member) {
      console.log(
        `[removeSellerAppMetadataStep] Member ${memberId} not found, nothing to do`
      );
      const result: RemoveResult = { removed: false };
      return new StepResponse(result, undefined as CompensationData | undefined);
    }

    console.log(
      `[removeSellerAppMetadataStep] Found member ${memberId} with seller_id ${member.seller_id}`
    );

    // Scan auth_identities to find which one has this member
    // NOTE: For better performance at scale, consider adding a
    // member_id → auth_identity_id link table
    const authIdentities = await authService.listAuthIdentities({});

    for (const identity of authIdentities) {
      const appMetadata = identity.app_metadata || {};
      const memberships: SellerMembership[] = Array.isArray(appMetadata.seller_memberships)
        ? appMetadata.seller_memberships
        : [];

      // Find the membership for this member
      const membershipIndex = memberships.findIndex(
        (m) => m.member_id === memberId
      );

      if (membershipIndex !== -1) {
        console.log(
          `[removeSellerAppMetadataStep] Found auth_identity ${identity.id} with membership at index ${membershipIndex}`
        );

        // Found the auth_identity - remove the membership
        const removedMembership = memberships[membershipIndex];
        const previousMemberships = [...memberships];
        const previousActiveSellerId = appMetadata.active_seller_id as string;

        // Remove from array
        memberships.splice(membershipIndex, 1);
        appMetadata.seller_memberships = memberships;

        // Handle active_seller_id
        let shouldLogout = false;
        let newActiveSellerId: string | undefined = appMetadata.active_seller_id as string | undefined;

        if (appMetadata.active_seller_id === member.seller_id) {
          if (memberships.length > 0) {
            // Switch to first available vendor
            newActiveSellerId = memberships[0].seller_id;
            appMetadata.active_seller_id = newActiveSellerId;
            console.log(
              `[removeSellerAppMetadataStep] Auto-switching active_seller_id to ${newActiveSellerId}`
            );
          } else {
            // No vendors left - user should be logged out
            delete appMetadata.active_seller_id;
            newActiveSellerId = undefined;
            shouldLogout = true;
            console.log(
              `[removeSellerAppMetadataStep] No vendors left, user should logout`
            );
          }
        }

        await authService.updateAuthIdentities([
          {
            id: identity.id,
            app_metadata: appMetadata,
          },
        ]);

        console.log(
          `[removeSellerAppMetadataStep] Successfully removed membership. Remaining: ${memberships.length}`
        );

        const result: RemoveResult = {
          removed: true,
          shouldLogout,
          newActiveSellerId,
        };
        const compensation: CompensationData | undefined = {
          authIdentityId: identity.id,
          removedMembership,
          previousMemberships,
          previousActiveSellerId,
        };
        return new StepResponse(result, compensation);
      }
    }

    // No auth_identity found with this member - orphaned member record
    console.warn(
      `[removeSellerAppMetadataStep] No auth_identity found with member ${memberId} - orphaned member`
    );
    const result: RemoveResult = { removed: false, orphaned: true };
    return new StepResponse(result, undefined as CompensationData | undefined);
  },
  /**
   * Compensation function: Restores the membership if the workflow fails.
   */
  async (compensationData, { container }) => {
    if (!compensationData || !compensationData.authIdentityId) {
      console.log(
        `[removeSellerAppMetadataStep:compensation] No compensation data, skipping rollback`
      );
      return;
    }

    const {
      authIdentityId,
      previousMemberships,
      previousActiveSellerId,
    } = compensationData;
    const authService = container.resolve(Modules.AUTH);

    console.log(
      `[removeSellerAppMetadataStep:compensation] Restoring membership for auth ${authIdentityId}`
    );

    const authIdentity = await authService.retrieveAuthIdentity(authIdentityId);
    const appMetadata = authIdentity.app_metadata || {};

    // Restore previous state
    appMetadata.seller_memberships = previousMemberships;
    appMetadata.active_seller_id = previousActiveSellerId;

    await authService.updateAuthIdentities([
      {
        id: authIdentityId,
        app_metadata: appMetadata,
      },
    ]);

    console.log(
      `[removeSellerAppMetadataStep:compensation] Successfully restored memberships`
    );
  }
);
