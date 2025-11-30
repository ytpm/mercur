import { transform } from "@medusajs/framework/workflows-sdk";
import {
  WorkflowResponse,
  createHook,
  createWorkflow,
} from "@medusajs/workflows-sdk";

import { CreateMemberDTO, CreateSellerDTO, MemberRole } from "@mercurjs/framework";

import {
  createMemberStep,
  createSellerOnboardingStep,
  createSellerStep,
  createSellerShippingProfileStep,
  setSellerAppMetadataStep,
} from "../steps";

/**
 * Input type for the create seller workflow.
 */
type CreateSellerWorkflowInput = {
  /** The seller data to create */
  seller: CreateSellerDTO;
  /** The initial owner member data (seller_id will be added automatically) */
  member: Omit<CreateMemberDTO, "seller_id">;
  /** The auth identity ID of the user creating the seller */
  auth_identity_id: string;
};

/**
 * Workflow to create a new seller with initial owner member.
 *
 * Modified for multi-vendor: uses setSellerAppMetadataStep instead of
 * the default setAuthAppMetadataStep. This allows the same user to
 * create multiple sellers and have all of them in seller_memberships.
 *
 * Flow:
 * 1. Create the seller entity
 * 2. Create the owner member linked to seller
 * 3. Create onboarding record
 * 4. Link auth identity to member via seller_memberships array
 * 5. Create shipping profile
 * 6. Fire sellerCreated hook
 */
export const createSellerWorkflow = createWorkflow(
  "create-seller",
  function (input: CreateSellerWorkflowInput) {
    // Step 1: Create the seller entity
    const seller = createSellerStep(input.seller);

    // Step 2: Create the owner member linked to seller
    const memberInput = transform(
      { seller, member: input.member },
      ({ member, seller }) => ({
        ...member,
        seller_id: seller.id,
      })
    );

    const member = createMemberStep(memberInput);

    // Step 3: Create onboarding record
    createSellerOnboardingStep(seller);

    // Step 4: Link auth identity to member (MODIFIED for multi-vendor)
    // Uses setSellerAppMetadataStep which stores memberships in an array
    // First-time seller creation automatically sets this as the user's active_seller_id
    const metadataInput = transform(
      { member, seller, authIdentityId: input.auth_identity_id },
      ({ member, seller, authIdentityId }) => ({
        authIdentityId,
        memberId: member.id,
        sellerId: seller.id,
        role: member.role || MemberRole.OWNER,
      })
    );

    setSellerAppMetadataStep(metadataInput);

    // Step 5: Create shipping profile
    createSellerShippingProfileStep(seller);

    // Step 6: Fire sellerCreated hook for extensions
    const sellerCreatedHook = createHook("sellerCreated", {
      sellerId: seller.id,
    });

    return new WorkflowResponse(seller, { hooks: [sellerCreatedHook] });
  }
);
