import { createWorkflow, WorkflowResponse } from "@medusajs/workflows-sdk";

import { deleteMemberStep, removeSellerAppMetadataStep } from "../steps";

/**
 * Workflow to delete a member and remove their vendor access.
 * Handles auto-switching or logout if necessary.
 *
 * Flow:
 * 1. Remove from app_metadata (handles auth_identity lookup and active vendor switching)
 * 2. Delete the member record (soft delete)
 *
 * @param id - The member ID (string) - matches MercurJS pattern
 *
 * The removeSellerAppMetadataStep handles finding the correct auth_identity
 * by scanning for the member_id in seller_memberships[].
 */
export const deleteMemberWorkflow = createWorkflow(
  "delete-member",
  function (id: string) {
    // Step 1: Remove from app_metadata (handles auth_identity lookup and active vendor switching)
    const result = removeSellerAppMetadataStep(id);

    // Step 2: Delete the member record (soft delete)
    deleteMemberStep(id);

    return new WorkflowResponse(result);
  }
);
