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
 * Input for the sync member role step.
 */
interface SyncMemberRoleInput {
  /** The member ID whose role changed */
  memberId: string;
  /** The new role to sync */
  newRole: string;
}

/**
 * Result of the sync operation.
 */
interface SyncResult {
  /** Whether the role was successfully synced */
  synced: boolean;
  /** The auth identity ID that was updated (if any) */
  authIdentityId?: string;
}

/**
 * Compensation data for rollback if workflow fails.
 */
interface CompensationData {
  /** The auth identity ID that was modified */
  authIdentityId: string;
  /** The index of the membership in the array */
  membershipIndex: number;
  /** The old role before the change */
  oldRole: string;
}

/**
 * Step ID for the sync member role to app metadata step.
 */
export const syncMemberRoleToAppMetadataStepId = "sync-member-role-app-metadata";

/**
 * Step to sync a member's role change to app_metadata.seller_memberships.
 * This keeps the cached role in auth_identity consistent with the member table.
 *
 * NOTE: This step looks up the auth_identity by scanning for the member_id
 * in seller_memberships[], since there's no direct member → auth_identity link.
 *
 * When to use:
 * - After updating a member's role via updateMemberWorkflow
 * - To keep role badges in vendor switcher up-to-date
 */
export const syncMemberRoleToAppMetadataStep = createStep(
  syncMemberRoleToAppMetadataStepId,
  async (data: SyncMemberRoleInput, { container }) => {
    const authService = container.resolve(Modules.AUTH);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    console.log(
      `[syncMemberRoleToAppMetadataStep] Syncing role for member ${data.memberId} to ${data.newRole}`
    );

    // Find the member to verify it exists
    const {
      data: [member],
    } = await query.graph({
      entity: "member",
      fields: ["id", "seller_id"],
      filters: { id: data.memberId },
    });

    if (!member) {
      console.log(
        `[syncMemberRoleToAppMetadataStep] Member ${data.memberId} not found, nothing to sync`
      );
      const result: SyncResult = { synced: false };
      return new StepResponse(result, undefined as CompensationData | undefined);
    }

    // Find auth_identity that has this member in seller_memberships
    // NOTE: For better performance at scale, consider adding a member_id → auth_identity_id link table
    const authIdentities = await authService.listAuthIdentities({});

    for (const identity of authIdentities) {
      const appMetadata = identity.app_metadata || {};
      const memberships: SellerMembership[] = Array.isArray(appMetadata.seller_memberships)
        ? appMetadata.seller_memberships
        : [];

      const membershipIndex = memberships.findIndex(
        (m) => m.member_id === data.memberId
      );

      if (membershipIndex !== -1) {
        console.log(
          `[syncMemberRoleToAppMetadataStep] Found auth_identity ${identity.id} with membership at index ${membershipIndex}`
        );

        const oldRole = memberships[membershipIndex].role;

        // Skip if role hasn't actually changed
        if (oldRole === data.newRole) {
          console.log(
            `[syncMemberRoleToAppMetadataStep] Role unchanged, skipping`
          );
          const result: SyncResult = { synced: true, authIdentityId: identity.id };
          return new StepResponse(result, undefined as CompensationData | undefined);
        }

        // Update the role
        memberships[membershipIndex].role = data.newRole;

        await authService.updateAuthIdentities([
          {
            id: identity.id,
            app_metadata: {
              ...appMetadata,
              seller_memberships: memberships,
            },
          },
        ]);

        console.log(
          `[syncMemberRoleToAppMetadataStep] Successfully synced role from ${oldRole} to ${data.newRole}`
        );

        const result: SyncResult = { synced: true, authIdentityId: identity.id };
        const compensation: CompensationData | undefined = { authIdentityId: identity.id, membershipIndex, oldRole };
        return new StepResponse(result, compensation);
      }
    }

    // No auth_identity found with this member - could be orphaned member
    console.warn(
      `[syncMemberRoleToAppMetadataStep] No auth_identity found with member ${data.memberId} - orphaned member?`
    );
    const result: SyncResult = { synced: false };
    return new StepResponse(result, undefined as CompensationData | undefined);
  },
  /**
   * Compensation function: Restores the old role if the workflow fails.
   */
  async (compensationData, { container }) => {
    if (!compensationData || !compensationData.authIdentityId) {
      console.log(
        `[syncMemberRoleToAppMetadataStep:compensation] No compensation data, skipping rollback`
      );
      return;
    }

    const { authIdentityId, membershipIndex, oldRole } = compensationData;
    const authService = container.resolve(Modules.AUTH);

    console.log(
      `[syncMemberRoleToAppMetadataStep:compensation] Restoring role for auth ${authIdentityId}`
    );

    const authIdentity = await authService.retrieveAuthIdentity(authIdentityId);
    const appMetadata = authIdentity.app_metadata || {};
    const memberships: SellerMembership[] = Array.isArray(appMetadata.seller_memberships)
      ? appMetadata.seller_memberships
      : [];

    if (memberships[membershipIndex]) {
      memberships[membershipIndex].role = oldRole;

      await authService.updateAuthIdentities([
        {
          id: authIdentityId,
          app_metadata: {
            ...appMetadata,
            seller_memberships: memberships,
          },
        },
      ]);

      console.log(
        `[syncMemberRoleToAppMetadataStep:compensation] Successfully restored role to ${oldRole}`
      );
    }
  }
);
