import { parallelize } from "@medusajs/framework/workflows-sdk";
import { WorkflowResponse, createWorkflow } from "@medusajs/workflows-sdk";

import { AcceptMemberInviteDTO } from "@mercurjs/framework";

import {
  createMemberStep,
  updateMemberInviteStep,
  setSellerAppMetadataStep,
} from "../steps";
import { validateMemberInviteStep } from "../steps/validate-member-invites";

/**
 * Input type for the accept member invite workflow.
 */
type AcceptMemberInviteWorkflowInput = {
  /** The invite data containing token and user details */
  invite: AcceptMemberInviteDTO;
  /** The auth identity ID of the user accepting the invite */
  authIdentityId: string;
};

/**
 * Workflow to accept a member invite and link to auth identity.
 *
 * Supports multi-vendor membership by using setSellerAppMetadataStep
 * instead of the default setAuthAppMetadataStep. This allows users
 * to be members of multiple vendors simultaneously.
 *
 * Flow:
 * 1. Validate the invite token
 * 2. Create member record and mark invite as accepted (parallel)
 * 3. Link auth identity to member via seller_memberships array
 */
export const acceptMemberInvitesWorkflow = createWorkflow(
  "accept-member-invite",
  function (input: AcceptMemberInviteWorkflowInput) {
    // Step 1: Validate the invite token and retrieve invite details
    const invite = validateMemberInviteStep(input.invite);

    // Step 2: Create member and mark invite as accepted (parallel for performance)
    const [member] = parallelize(
      createMemberStep({
        seller_id: invite.seller.id,
        name: input.invite.name,
        role: invite.role,
        email: invite.email,
      }),
      updateMemberInviteStep({
        id: invite.id,
        accepted: true,
      })
    );

    // Step 3: Link auth identity to member (MODIFIED for multi-vendor)
    // Uses setSellerAppMetadataStep which stores memberships in an array
    // allowing users to belong to multiple vendors
    setSellerAppMetadataStep({
      authIdentityId: input.authIdentityId,
      memberId: member.id,
      sellerId: invite.seller.id,
      role: invite.role,
    });

    return new WorkflowResponse(invite);
  }
);
