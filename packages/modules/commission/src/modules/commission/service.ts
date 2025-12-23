import { MedusaService } from "@medusajs/framework/utils";

import { CommissionRate, CommissionRule } from "./models";
import { CommissionLine } from "./models/commission_line";
import {
  CommissionCalculationContext,
  CommissionRuleDTO,
} from "@ytpm/mercurjs-framework";

class CommissionModuleService extends MedusaService({
  CommissionRate,
  CommissionRule,
  CommissionLine,
}) {
  private async selectCommissionRule(reference: string, reference_id: string) {
    const [rule] = await this.listCommissionRules(
      { reference, reference_id, is_active: true, deleted_at: null },
      { relations: ["rate"] }
    );

    return rule;
  }

  /**
   * Looks for first applicable CommissionRule for given context. The queries are executed in assumed priority order.
   * Priority order (highest to lowest):
   * 1. seller+product - specific event for specific vendor (event-level override)
   * 2. product - specific event (global event commission)
   * 3. seller+product_type - vendor + product type combination
   * 4. seller+product_category - vendor + product category combination
   * 5. seller - vendor default commission
   * 6. product_type - by product type
   * 7. product_category - by product category
   * 8. site - global default
   * @param ctx Calculation context including product_id for event-level commission
   * @returns CommissionRule applicable for given context or null
   */
  async selectCommissionForProductLine(
    ctx: CommissionCalculationContext
  ): Promise<CommissionRuleDTO | null> {
    console.log("[CommissionService] selectCommissionForProductLine called with context:", {
      product_id: ctx.product_id,
      seller_id: ctx.seller_id,
      product_type_id: ctx.product_type_id,
      product_category_id: ctx.product_category_id,
    });

    const ruleQueries = [
      // NEW: Event-specific for vendor (highest priority - event-level override)
      {
        reference: "seller+product",
        reference_id: `${ctx.seller_id}+${ctx.product_id}`,
      },
      // NEW: Event-specific global
      {
        reference: "product",
        reference_id: ctx.product_id,
      },
      // Existing priorities
      {
        reference: "seller+product_type",
        reference_id: `${ctx.seller_id}+${ctx.product_type_id}`,
      },
      {
        reference: "seller+product_category",
        reference_id: `${ctx.seller_id}+${ctx.product_category_id}`,
      },
      { reference: "seller", reference_id: ctx.seller_id },
      { reference: "product_type", reference_id: ctx.product_type_id },
      { reference: "product_category", reference_id: ctx.product_category_id },
      { reference: "site", reference_id: "" },
    ];

    for (const { reference, reference_id } of ruleQueries) {
      const rule = await this.selectCommissionRule(reference, reference_id);
      if (rule) {
        console.log("[CommissionService] Found commission rule:", {
          ruleId: rule.id,
          reference: rule.reference,
          reference_id: rule.reference_id,
        });
        return rule;
      }
    }

    console.log("[CommissionService] No commission rule found for context");
    return null;
  }
}

export default CommissionModuleService;
