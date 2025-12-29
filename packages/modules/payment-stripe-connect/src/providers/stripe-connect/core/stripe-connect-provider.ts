//@ts-nocheck
import Stripe from "stripe";

import {
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/framework/types";
import {
  AbstractPaymentProvider,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
  isPresent,
} from "@medusajs/framework/utils";
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
} from "@medusajs/types";

import {
  getAmountFromSmallestUnit,
  getSmallestUnit,
  ErrorCodes,
  ErrorIntentStatus,
  PaymentIntentOptions,
  CommissionRuleDTO,
} from "@mercurjs/framework";

/**
 * Payment modes for seller payment routing.
 * - STRIPE_CONNECT: Payments go to vendor's Stripe Connect account with automatic commission
 * - PLATFORM: Payments go to platform, vendor payouts handled manually
 */
const PAYMENT_MODES = {
  STRIPE_CONNECT: "stripe_connect",
  PLATFORM: "platform",
} as const;

/** Default commission rate (10%) if no rule is found */
const DEFAULT_COMMISSION_RATE = 0.1;

/** Commission module identifier for container resolution */
const COMMISSION_MODULE = "commission";

type Options = {
  apiKey: string;
  webhookSecret: string;
};

abstract class StripeConnectProvider extends AbstractPaymentProvider<Options> {
  private readonly options_: Options;
  private readonly client_: Stripe;
  /** Container reference for accessing MedusaJS services like commission module */
  protected readonly container_: any;

  constructor(container, options: Options) {
    super(container);

    this.container_ = container;
    this.options_ = options;

    this.client_ = new Stripe(options.apiKey);
  }

  abstract get paymentIntentOptions(): PaymentIntentOptions;

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const id = input.data?.id as string;
    const paymentIntent = await this.client_.paymentIntents.retrieve(id);
    const dataResponse = paymentIntent as unknown as Record<string, unknown>;

    switch (paymentIntent.status) {
      case "requires_payment_method":
      case "requires_confirmation":
      case "processing":
        return { status: PaymentSessionStatus.PENDING, data: dataResponse };
      case "requires_action":
        return {
          status: PaymentSessionStatus.REQUIRES_MORE,
          data: dataResponse,
        };
      case "canceled":
        return { status: PaymentSessionStatus.CANCELED, data: dataResponse };
      case "requires_capture":
        return { status: PaymentSessionStatus.AUTHORIZED, data: dataResponse };
      case "succeeded":
        return { status: PaymentSessionStatus.CAPTURED, data: dataResponse };
      default:
        return { status: PaymentSessionStatus.PENDING, data: dataResponse };
    }
  }

  /**
   * Initiates a payment intent with support for both Stripe Connect and Platform payment modes.
   *
   * For Stripe Connect mode:
   * - Adds transfer_data.destination pointing to vendor's connected account
   * - Adds application_fee_amount for automatic commission deduction
   *
   * For Platform mode:
   * - No transfer_data, full amount goes to platform account
   * - Commission tracked via MercurJS commission_lines
   *
   * Both modes add metadata for tracking: seller_id, event_id, event_number, payment_mode, commission_rate
   *
   * @param input - Payment initiation input with amount, currency, and context
   * @returns Payment session data including client_secret for frontend
   */
  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context, data } = input;

    // DEBUG: Log all input fields to trace what MedusaJS passes to the provider
    console.log(`[StripeConnect] === INITIATE PAYMENT INPUT DEBUG ===`);
    console.log(`[StripeConnect] amount: ${amount}`);
    console.log(`[StripeConnect] currency_code: ${currency_code}`);
    console.log(`[StripeConnect] context keys: ${context ? Object.keys(context).join(', ') : 'null'}`);
    console.log(`[StripeConnect] context: ${JSON.stringify(context, null, 2)}`);
    console.log(`[StripeConnect] data keys: ${data ? Object.keys(data).join(', ') : 'null'}`);
    console.log(`[StripeConnect] data: ${JSON.stringify(data, null, 2)}`);
    console.log(`[StripeConnect] full input keys: ${Object.keys(input).join(', ')}`);
    console.log(`[StripeConnect] === END DEBUG ===`);

    // Customer email comes from context (auto-populated by Medusa)
    const email = context?.customer?.email;

    // Extract seller and event info from 'data' field (custom data passed from storefront)
    // Note: MedusaJS v2.10+ removed 'context' field from API requests; custom data now uses 'data' field
    const sellerId = (data?.seller_id || context?.seller_id) as string | undefined;
    const eventId = (data?.event_id || context?.event_id) as string | undefined;
    const eventNumber = (data?.event_number || context?.event_number) as string | undefined;
    const paymentMode = ((data?.payment_mode || context?.payment_mode) as string) || PAYMENT_MODES.PLATFORM;
    const stripeAccountId = (data?.stripe_account_id || context?.stripe_account_id) as string | undefined;

    // Check if event requires attendee approval (pre-authorization / manual capture)
    // Use nullish coalescing (??) instead of || to handle false values correctly
    const requiresApproval = (data?.requires_approval ?? context?.requires_approval) as boolean;

    console.log(
      `[StripeConnect] Initiating payment: seller=${sellerId}, event=${eventId}, mode=${paymentMode}, requiresApproval=${requiresApproval}`
    );

    /**
     * Platform fee handling (Commission Restructure)
     *
     * Platform fee is now passed directly from the storefront via cart.metadata.
     * This bypasses the old MercurJS commission_rules lookup.
     *
     * @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
     */
    const platformFee = Number(data?.platform_fee) || 0;
    const platformFeeMode = (data?.platform_fee_mode as string) || "on_top";

    // Convert from major units (e.g., THB, USD) to minor units (satang, cents)
    // MedusaJS stores prices in minor units, Stripe expects minor units
    const amountSmallest = getSmallestUnit(amount, currency_code);

    // Convert platform fee to smallest unit
    // Platform fee is stored in major units in cart.metadata
    const platformFeeSmallest = getSmallestUnit(platformFee, currency_code);

    console.log(`[StripeConnect] Amount conversion: input=${amount}, amountSmallest=${amountSmallest}`);
    console.log(`[StripeConnect] Platform fee: ${platformFee} (${platformFeeSmallest} smallest), mode: ${platformFeeMode}`);

    // === DEPRECATED: Old commission service lookup ===
    // The following code used MercurJS commission_rules to calculate commission.
    // Now using event-level commission passed via platform_fee.
    // Kept for reference only.
    //
    // let commissionRate = DEFAULT_COMMISSION_RATE;
    // if (sellerId) {
    //   const commissionService = this.container_?.[COMMISSION_MODULE];
    //   if (commissionService?.selectCommissionForProductLine) {
    //     const commissionRule = await commissionService.selectCommissionForProductLine({...});
    //     commissionRate = commissionRule.rate.percentage_rate / 100;
    //   }
    // }
    // const commissionAmount = Math.round(amountSmallest * commissionRate);
    // === END DEPRECATED ===

    // Build payment intent params
    // CRITICAL: session_id MUST be included in metadata for webhook handler to work correctly
    // The getWebhookActionAndData method reads intent.metadata.session_id to return to processPaymentWorkflow
    // Without this, the workflow queries with undefined session_id and returns wrong/random results
    const sessionId = data?.session_id as string | undefined;
    console.log(`[StripeConnect] Session ID from input data: ${sessionId}`);

    const paymentIntentInput: Stripe.PaymentIntentCreateParams = {
      ...this.paymentIntentOptions,
      currency: currency_code,
      amount: amountSmallest,
      // Use manual capture for approval-required events (pre-authorization)
      // This places a hold on the card without charging until explicitly captured
      capture_method: requiresApproval ? 'manual' : 'automatic',
      // IMPORTANT: When using automatic_payment_methods with Stripe Elements,
      // payment_method_options.card.capture_method only accepts 'manual'.
      // For automatic capture, omit this field entirely.
      // See: https://docs.stripe.com/payments/payment-element/migration-ct
      ...(requiresApproval && {
        payment_method_options: {
          card: {
            capture_method: 'manual' as const,
          },
        },
      }),
      metadata: {
        // CRITICAL: session_id required for webhook handler - see getWebhookActionAndData
        session_id: sessionId || "",
        // Standard tracking metadata for all payments
        seller_id: sellerId || "",
        event_id: eventId || "",
        event_number: eventNumber || "",
        payment_mode: paymentMode,
        platform: "bumpy.fm",
        // Platform fee for commission tracking (replaces old commission_rate)
        // @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
        platform_fee: String(platformFee),
        platform_fee_mode: platformFeeMode,
        // Track if approval is required for webhook handling and downstream processing
        requires_approval: requiresApproval ? "true" : "false",
      },
    };

    // Add Connect-specific params for Stripe Connect mode
    if (paymentMode === PAYMENT_MODES.STRIPE_CONNECT && stripeAccountId) {
      paymentIntentInput.transfer_data = {
        destination: stripeAccountId,
      };
      // Platform fee taken automatically at payment time via application_fee_amount
      // Uses the pre-calculated platform_fee from event commission settings
      paymentIntentInput.application_fee_amount = platformFeeSmallest;

      console.log(
        `[StripeConnect] Connect mode: destination=${stripeAccountId}, fee=${platformFeeSmallest} (${platformFee} major units)`
      );
    } else {
      // Platform mode: No transfer_data, full amount goes to platform account
      // Platform fee tracked on SplitOrderPayment for payout calculation
      console.log(
        `[StripeConnect] Platform mode: amount=${amountSmallest}, platform_fee=${platformFee} tracked on order`
      );
    }

    // Get or create Stripe customer
    try {
      const {
        data: [customer],
      } = await this.client_.customers.list({
        email,
        limit: 1,
      });

      if (customer) {
        paymentIntentInput.customer = customer.id;
      }
    } catch (error) {
      throw this.buildError(
        "An error occurred in initiatePayment when retrieving a Stripe customer",
        error
      );
    }

    if (!paymentIntentInput.customer) {
      try {
        const customer = await this.client_.customers.create({ email });
        paymentIntentInput.customer = customer.id;
      } catch (error) {
        throw this.buildError(
          "An error occurred in initiatePayment when creating a Stripe customer",
          error
        );
      }
    }

    // Create the payment intent
    try {
      const data = (await this.client_.paymentIntents.create(
        paymentIntentInput
      )) as any;

      console.log(`[StripeConnect] Created PaymentIntent: ${data.id}`);

      return {
        id: data.id,
        data,
      };
    } catch (error) {
      throw this.buildError(
        "An error occurred in initiatePayment when creating a Stripe payment intent",
        error
      );
    }
  }

  async authorizePayment(
    data: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const result = await this.getPaymentStatus(data);
    if (result.status === PaymentSessionStatus.CAPTURED) {
      return { status: PaymentSessionStatus.AUTHORIZED, data: result.data };
    }

    return result;
  }

  async cancelPayment({
    data: paymentSessionData,
  }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    try {
      const id = paymentSessionData?.id as string;

      if (!id) {
        return { data: paymentSessionData };
      }

      const data = (await this.client_.paymentIntents.cancel(id)) as any;
      return { data };
    } catch (error) {
      throw this.buildError("An error occurred in cancelPayment", error);
    }
  }

  async capturePayment({
    data: paymentSessionData,
  }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const id = paymentSessionData?.id as string;
    try {
      const data = (await this.client_.paymentIntents.capture(id)) as any;
      return { data };
    } catch (error) {
      if (error.code === ErrorCodes.PAYMENT_INTENT_UNEXPECTED_STATE) {
        if (error.payment_intent?.status === ErrorIntentStatus.SUCCEEDED) {
          return { data: error.payment_intent };
        }
      }
      throw this.buildError("An error occurred in capturePayment", error);
    }
  }

  deletePayment(data: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return this.cancelPayment(data);
  }

  /**
   * Refund a payment through Stripe Connect.
   *
   * Commission Restructure:
   * - For full refunds, we refund the application_fee_amount back to the customer
   * - For partial refunds, we don't refund the platform fee (proportional refund is complex)
   * - The platform_fee was added "on_top" of the ticket price
   *
   * @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
   */
  async refundPayment({
    data: paymentSessionData,
    amount,
  }: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const id = paymentSessionData?.id as string;

    try {
      // Convert refund amount from major units to minor units
      const currency = paymentSessionData?.currency as string;
      const amountNumeric = getSmallestUnit(amount, currency);

      console.log(`[StripeConnect] Refunding payment: ${id}, amount: ${amount} (${amountNumeric} smallest units)`);

      // Retrieve the PaymentIntent to check if this is a full refund
      const paymentIntent = await this.client_.paymentIntents.retrieve(id);
      const capturedAmount = paymentIntent.amount_received || paymentIntent.amount;
      const isFullRefund = amountNumeric >= capturedAmount;

      console.log(`[StripeConnect] PaymentIntent captured: ${capturedAmount}, refund: ${amountNumeric}, isFullRefund: ${isFullRefund}`);

      /**
       * Stripe Connect Refund Options:
       * - refund_application_fee: true = Refund the platform's application_fee_amount
       * - reverse_transfer: true = Reverse the transfer to the connected account
       *
       * For full refunds, we refund the application fee (platform fee) as well.
       * For partial refunds, we only refund from the connected account (vendor's portion).
       */
      await this.client_.refunds.create({
        amount: amountNumeric,
        payment_intent: id as string,
        // For full refunds, refund the application fee (platform fee)
        // This returns the platform fee to the customer
        refund_application_fee: isFullRefund,
      });

      console.log(`[StripeConnect] Refund created successfully, refund_application_fee: ${isFullRefund}`);
    } catch (e) {
      throw this.buildError("An error occurred in refundPayment", e);
    }

    return { data: paymentSessionData };
  }

  async retrievePayment({
    data: paymentSessionData,
  }: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    try {
      const id = paymentSessionData?.id as string;
      const intent = (await this.client_.paymentIntents.retrieve(id)) as any;

      // Convert from Stripe's minor units back to major units for MedusaJS display
      intent.amount = getAmountFromSmallestUnit(intent.amount, intent.currency);
      console.log("[StripeConnect] Retrieving payment intent:", intent.id, "amount:", intent.amount);
      return { data: intent };
    } catch (e) {
      throw this.buildError("An error occurred in retrievePayment", e);
    }
  }

  /**
   * Updates an existing payment intent when the cart total changes.
   *
   * For Stripe Connect mode:
   * - Recalculates application_fee_amount based on stored commission_rate in metadata
   * - Note: transfer_data.destination cannot be changed after creation
   *
   * @param input - Update input with new amount and existing payment data
   * @returns Updated payment session data
   */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const { data, amount, currency_code } = input;

    // Convert from major units to minor units for Stripe
    const amountNumeric = getSmallestUnit(amount, currency_code);

    if (isPresent(amount) && data?.amount === amountNumeric) {
      return { data };
    }

    try {
      const id = data?.id as string;

      // Build update params
      const updateParams: Stripe.PaymentIntentUpdateParams = {
        amount: amountNumeric,
      };

      // Recalculate application_fee_amount if this is a Connect payment
      // NOTE: With the new commission restructure, the platform_fee is a fixed amount
      // (not a percentage), so we don't need to recalculate it when the amount changes.
      // The fee was already calculated based on the original ticket prices.
      //
      // However, if the cart total changes (e.g., coupon applied), we may need to
      // adjust the fee proportionally. For now, we keep the original fee.
      //
      // @see docs/active/COMMISSION_RESTRUCTURE_IMPLEMENTATION.md
      const paymentMode = data?.metadata?.payment_mode;
      const platformFeeStr = data?.metadata?.platform_fee;
      const platformFee = platformFeeStr ? parseFloat(platformFeeStr) : 0;

      if (paymentMode === PAYMENT_MODES.STRIPE_CONNECT && platformFee > 0) {
        // Convert platform fee to smallest unit
        const currency = data?.currency as string || "usd";
        const platformFeeSmallest = getSmallestUnit(platformFee, currency);
        updateParams.application_fee_amount = platformFeeSmallest;

        console.log(
          `[StripeConnect] Updating payment ${id}: amount=${amountNumeric}, fee=${platformFeeSmallest} (${platformFee} major units)`
        );
      } else {
        console.log(`[StripeConnect] Updating payment ${id}: amount=${amountNumeric}`);
      }

      const sessionData = (await this.client_.paymentIntents.update(id, updateParams)) as any;

      return { data: sessionData };
    } catch (e) {
      throw this.buildError("An error occurred in updatePayment", e);
    }
  }

  async updatePaymentData(sessionId: string, data: Record<string, unknown>) {
    try {
      // Prevent from updating the amount from here as it should go through
      // the updatePayment method to perform the correct logic
      if (isPresent(data.amount)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Cannot update amount, use updatePayment instead"
        );
      }

      return (await this.client_.paymentIntents.update(sessionId, {
        ...data,
      })) as any;
    } catch (e) {
      throw this.buildError("An error occurred in updatePaymentData", e);
    }
  }

  async getWebhookActionAndData(
    webhookData: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const event = this.constructWebhookEvent(webhookData);
    const intent = event.data.object as Stripe.PaymentIntent;
    const currency = intent.currency;

    console.log(`[StripeConnect] Webhook event: ${event.type}, intent: ${intent.id}`);

    switch (event.type) {
      case "payment_intent.amount_capturable_updated":
        return {
          action: PaymentActions.AUTHORIZED,
          data: {
            session_id: intent.metadata.session_id,
            // Convert from Stripe's minor units back to major units
            amount: getAmountFromSmallestUnit(intent.amount_capturable, currency),
          },
        };
      case "payment_intent.succeeded":
        // IMPORTANT: Return NOT_SUPPORTED to prevent duplicate payment processing
        // The cart completion flow (completeCart -> authorizePaymentSession) already handles
        // payment capture. If we return SUCCESSFUL here, processPaymentWorkflow runs AGAIN
        // and creates a second PaymentIntent, causing the "cannot cancel succeeded" error.
        // See: docs/duplicate-payment-intent-investigation.md
        console.log(`[StripeConnect] payment_intent.succeeded received for ${intent.id} - returning NOT_SUPPORTED to prevent duplicate processing`);
        return { action: PaymentActions.NOT_SUPPORTED };
      case "payment_intent.payment_failed":
        return {
          action: PaymentActions.FAILED,
          data: {
            session_id: intent.metadata.session_id,
            // Convert from Stripe's minor units back to major units
            amount: getAmountFromSmallestUnit(intent.amount, currency),
          },
        };
      default:
        return { action: PaymentActions.NOT_SUPPORTED };
    }
  }

  constructWebhookEvent(data: ProviderWebhookPayload["payload"]): Stripe.Event {
    const signature = data.headers["stripe-signature"] as string;

    return this.client_.webhooks.constructEvent(
      data.rawData as string | Buffer,
      signature,
      this.options_.webhookSecret
    );
  }

  private buildError(message: string, error: Error) {
    return new MedusaError(
      MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
      `${message}: ${error}`
    );
  }
}

export default StripeConnectProvider;
