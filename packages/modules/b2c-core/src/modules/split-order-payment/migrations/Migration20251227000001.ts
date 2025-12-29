import { Migration } from '@mikro-orm/migrations';

/**
 * Migration: Add platform_fee fields to split_order_payment
 *
 * Part of the commission restructure from "deducted from vendor" to "added on top for customer".
 * These fields store the platform fee per order for payout calculation.
 *
 * @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
 */
export class Migration20251227000001 extends Migration {

  override async up(): Promise<void> {
    console.log('[Migration] Adding platform_fee fields to split_order_payment...');

    // Add platform_fee column (numeric with default 0)
    this.addSql(`ALTER TABLE "split_order_payment" ADD COLUMN IF NOT EXISTS "platform_fee" numeric NOT NULL DEFAULT 0;`);

    // Add raw_platform_fee column (jsonb for MedusaJS bigNumber precision tracking)
    this.addSql(`ALTER TABLE "split_order_payment" ADD COLUMN IF NOT EXISTS "raw_platform_fee" jsonb NOT NULL DEFAULT '{"value": "0", "precision": 20}';`);

    // Add platform_fee_mode column (text, nullable for backwards compatibility)
    this.addSql(`ALTER TABLE "split_order_payment" ADD COLUMN IF NOT EXISTS "platform_fee_mode" text NULL;`);

    console.log('[Migration] platform_fee fields added successfully');
  }

  override async down(): Promise<void> {
    console.log('[Migration] Removing platform_fee fields from split_order_payment...');

    this.addSql(`ALTER TABLE "split_order_payment" DROP COLUMN IF EXISTS "platform_fee";`);
    this.addSql(`ALTER TABLE "split_order_payment" DROP COLUMN IF EXISTS "raw_platform_fee";`);
    this.addSql(`ALTER TABLE "split_order_payment" DROP COLUMN IF EXISTS "platform_fee_mode";`);

    console.log('[Migration] platform_fee fields removed successfully');
  }

}
