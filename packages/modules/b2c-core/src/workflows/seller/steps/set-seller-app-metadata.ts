import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";

/**
 * Interface representing a seller membership stored in app_metadata.
 * Each membership links a user to a specific vendor with a role.
 */
interface SellerMembership {
  /** Reference to member table (member.id) */
  member_id: string;
  /** Reference to seller table (seller.id) - the vendor */
  seller_id: string;
  /** Role in this specific vendor */
  role: string;
}

/**
 * Input for the setSellerAppMetadataStep.
 */
interface SetSellerAppMetadataInput {
  /** The auth identity ID to update */
  authIdentityId: string;
  /** The member ID being linked */
  memberId: string;
  /** The seller/vendor ID */
  sellerId: string;
  /** The role for this membership */
  role: string;
}

/**
 * Compensation data for rollback if workflow fails.
 */
interface CompensationData {
  /** The auth identity ID that was modified */
  id: string;
  /** The membership that was added */
  addedMembership: SellerMembership;
  /** The memberships array before the addition */
  previousMemberships: SellerMembership[];
}

/**
 * Step ID for the set seller app metadata step.
 */
export const setSellerAppMetadataStepId = "set-seller-app-metadata";

/**
 * Custom step to handle multi-vendor membership in app_metadata.
 * Instead of storing a single seller_id, stores an array of seller_memberships.
 *
 * This step:
 * 1. Retrieves the auth identity by ID
 * 2. Initializes or appends to the seller_memberships array
 * 3. Prevents duplicate memberships to the same seller
 * 4. Sets active_seller_id if this is the first membership
 * 5. Removes legacy seller_id field if present (migration)
 *
 * @see https://docs.medusajs.com/resources/commerce-modules/auth/auth-identity-and-actor-types
 */
export const setSellerAppMetadataStep = createStep(
  setSellerAppMetadataStepId,
  async (data: SetSellerAppMetadataInput, { container }) => {
    const service = container.resolve(Modules.AUTH);

    console.log(
      `[setSellerAppMetadataStep] Adding membership for auth ${data.authIdentityId}: member=${data.memberId}, seller=${data.sellerId}, role=${data.role}`
    );

    // Retrieve the current auth identity
    const authIdentity = await service.retrieveAuthIdentity(data.authIdentityId);
    const appMetadata = authIdentity.app_metadata || {};

    // Initialize seller_memberships array if not exists
    const memberships: SellerMembership[] = Array.isArray(appMetadata.seller_memberships)
      ? appMetadata.seller_memberships
      : [];

    // Check if membership for this seller already exists
    const existingIndex = memberships.findIndex(
      (m) => m.seller_id === data.sellerId
    );

    if (existingIndex !== -1) {
      console.log(
        `[setSellerAppMetadataStep] User is already a member of seller ${data.sellerId}`
      );
      throw new Error(`User is already a member of seller ${data.sellerId}`);
    }

    // Create new membership
    const newMembership: SellerMembership = {
      member_id: data.memberId,
      seller_id: data.sellerId,
      role: data.role,
    };

    // Store previous state for compensation
    const previousMemberships = [...memberships];

    // Add new membership
    memberships.push(newMembership);

    // Set active_seller_id if this is the first membership, otherwise keep existing
    const activeSellerId = appMetadata.active_seller_id || data.sellerId;

    // Update app_metadata
    appMetadata.seller_memberships = memberships;
    appMetadata.active_seller_id = activeSellerId;

    // Remove legacy seller_id if exists (migration from single-vendor)
    if (appMetadata.seller_id) {
      console.log(
        `[setSellerAppMetadataStep] Removing legacy seller_id field during migration`
      );
      delete appMetadata.seller_id;
    }

    // Persist the changes
    await service.updateAuthIdentities([
      {
        id: authIdentity.id,
        app_metadata: appMetadata,
      },
    ]);

    console.log(
      `[setSellerAppMetadataStep] Successfully added membership. Total memberships: ${memberships.length}, active_seller_id: ${activeSellerId}`
    );

    return new StepResponse(authIdentity, {
      id: authIdentity.id,
      addedMembership: newMembership,
      previousMemberships,
    } as CompensationData);
  },
  /**
   * Compensation function: Removes the added membership if the workflow fails.
   * Restores the previous state of seller_memberships and active_seller_id.
   */
  async (compensationData: CompensationData | undefined, { container }) => {
    if (!compensationData) {
      console.log(
        `[setSellerAppMetadataStep:compensation] No compensation data, skipping rollback`
      );
      return;
    }

    const { id, previousMemberships } = compensationData;
    const service = container.resolve(Modules.AUTH);

    console.log(
      `[setSellerAppMetadataStep:compensation] Rolling back membership for auth ${id}`
    );

    const authIdentity = await service.retrieveAuthIdentity(id);
    const appMetadata = authIdentity.app_metadata || {};

    // Restore previous state
    appMetadata.seller_memberships = previousMemberships;

    // If no memberships remain, remove active_seller_id
    if (previousMemberships.length === 0) {
      delete appMetadata.active_seller_id;
    }

    await service.updateAuthIdentities([
      {
        id: authIdentity.id,
        app_metadata: appMetadata,
      },
    ]);

    console.log(
      `[setSellerAppMetadataStep:compensation] Successfully rolled back. Memberships: ${previousMemberships.length}`
    );
  }
);
