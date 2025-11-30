import {
  WorkflowResponse,
  createWorkflow,
  when,
  transform,
} from "@medusajs/workflows-sdk";

import { UpdateMemberDTO } from "@mercurjs/framework";

import { updateMemberStep, syncMemberRoleToAppMetadataStep } from "../steps";

/**
 * Workflow to update a member's profile.
 *
 * Modified for multi-vendor: syncs role changes to app_metadata.seller_memberships
 * to keep the cached role consistent with the member table.
 *
 * Flow:
 * 1. Update the member record in database
 * 2. If role was updated, sync to app_metadata (conditional step)
 */
export const updateMemberWorkflow = createWorkflow(
  "update-member",
  function (input: UpdateMemberDTO) {
    // Step 1: Update the member record (existing behavior)
    const updatedMember = updateMemberStep(input);

    // Step 2: If role was updated, sync to app_metadata (NEW)
    // This conditional step only runs when input.role is provided
    when(input, (data) => data.role !== undefined).then(() => {
      // Transform input to extract only the fields needed for sync
      const syncInput = transform(input, (data) => ({
        memberId: data.id,
        newRole: data.role!,
      }));

      syncMemberRoleToAppMetadataStep(syncInput);
    });

    return new WorkflowResponse(updatedMember);
  }
);
