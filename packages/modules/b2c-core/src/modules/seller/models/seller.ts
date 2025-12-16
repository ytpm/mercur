import { model } from "@medusajs/framework/utils";

import { SellerPaymentMode, StoreStatus } from "@mercurjs/framework";
import { MemberInvite } from "./invite";
import { Member } from "./member";
import { SellerOnboarding } from "./onboarding";

export const Seller = model.define("seller", {
  id: model.id({ prefix: "sel" }).primaryKey(),
  store_status: model.enum(StoreStatus).default(StoreStatus.ACTIVE),
  /**
   * Payment mode for the seller.
   * - STRIPE_CONNECT: Payments go to vendor's Connect account with automatic commission
   * - PLATFORM: Payments go to platform, manual payout to vendor
   */
  payment_mode: model
    .enum(SellerPaymentMode)
    .default(SellerPaymentMode.PLATFORM),
  name: model.text().searchable(),
  handle: model.text().unique(),
  description: model.text().searchable().nullable(),
  photo: model.text().nullable(),
  email: model.text().nullable(),
  phone: model.text().nullable(),
  address_line: model.text().nullable(),
  city: model.text().nullable(),
  state: model.text().nullable(),
  postal_code: model.text().nullable(),
  country_code: model.text().nullable(),
  tax_id: model.text().nullable(),
  /** Contact person first name */
  contact_first_name: model.text().nullable(),
  /** Contact person last name */
  contact_last_name: model.text().nullable(),
  /** Contact person email */
  contact_email: model.text().nullable(),
  /** Contact person phone number */
  contact_phone: model.text().nullable(),
  members: model.hasMany(() => Member),
  invites: model.hasMany(() => MemberInvite),
  onboarding: model.hasOne(() => SellerOnboarding).nullable(),
});
