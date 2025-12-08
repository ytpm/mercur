import { Migration } from "@mikro-orm/migrations";

/**
 * Migration to add payment_mode column to seller table.
 * Supports two payment modes:
 * - stripe_connect: Payments go to vendor's Connect account with automatic commission
 * - platform: Payments go to platform, manual payout to vendor
 */
export class Migration20251208233509 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "seller" add column if not exists "payment_mode" text check ("payment_mode" in ('stripe_connect', 'platform')) not null default 'platform';`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "seller" drop column if exists "payment_mode";`
    );
  }
}
