import { Migration } from "@mikro-orm/migrations";

/**
 * Migration to add contact person fields to seller table.
 * Adds first name, last name, email, and phone for the primary contact person.
 */
export class Migration20251216153000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "seller" add column if not exists "contact_first_name" text null;`
    );
    this.addSql(
      `alter table if exists "seller" add column if not exists "contact_last_name" text null;`
    );
    this.addSql(
      `alter table if exists "seller" add column if not exists "contact_email" text null;`
    );
    this.addSql(
      `alter table if exists "seller" add column if not exists "contact_phone" text null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "seller" drop column if exists "contact_first_name";`
    );
    this.addSql(
      `alter table if exists "seller" drop column if exists "contact_last_name";`
    );
    this.addSql(
      `alter table if exists "seller" drop column if exists "contact_email";`
    );
    this.addSql(
      `alter table if exists "seller" drop column if exists "contact_phone";`
    );
  }
}
