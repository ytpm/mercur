import StripeConnectProvider from "../core/stripe-connect-provider";
import { PaymentIntentOptions, PaymentProviderKeys } from "@mercurjs/framework";

class StripeConnectCardProviderService extends StripeConnectProvider {
  static identifier = PaymentProviderKeys.CARD;

  constructor(_, options) {
    super(_, options);
  }

  get paymentIntentOptions(): PaymentIntentOptions {
    return {
      // Use automatic_payment_methods for compatibility with Stripe Elements deferred mode
      // The frontend uses Elements with mode: "payment" which requires automatic_payment_methods
      automatic_payment_methods: { enabled: true },
    };
  }
}

export default StripeConnectCardProviderService;
