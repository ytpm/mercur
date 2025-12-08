export enum StoreStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
}

/**
 * Payment mode enum for sellers.
 * Determines how payments are processed and where funds are directed.
 */
export enum SellerPaymentMode {
  /** Payments processed through vendor's Stripe Connect account with automatic commission */
  STRIPE_CONNECT = "stripe_connect",
  /** Payments processed through Bumpy.fm's Stripe account with manual vendor payouts */
  PLATFORM = "platform",
}

export type SellerDTO = {
  id: string;
  store_status: StoreStatus;
  /** Payment mode for processing seller payments */
  payment_mode: SellerPaymentMode;
  created_at: Date;
  updated_at: Date;
  name: string;
  email: string | null;
  phone: string | null;
  description: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country_code: string | null;
  tax_id: string | null;
  handle: string;
  photo: string | null;
  members?: Partial<MemberDTO>[];
};

export type SellerWithPayoutAccountDTO = SellerDTO & {
  payout_account: {
    id: string;
    created_at: Date;
    updated_at: Date;
    reference_id: string;
    data: Record<string, unknown>;
    status: string;
  };
};

export enum MemberRole {
  OWNER = "owner",
  ADMIN = "admin",
  MEMBER = "member",
}

export type MemberDTO = {
  id: string;
  created_at: Date;
  updated_at: Date;
  role: MemberRole;
  email: string | null;
  name: string | null;
  bio: string | null;
  photo: string | null;
  phone: string | null;
  seller?: Partial<SellerDTO>;
};

export type MemberInviteDTO = {
  id: string;
  created_at: Date;
  updated_at: Date;
  email: string;
  role: MemberRole;
  seller?: Partial<SellerDTO>;
  token: string;
  expires_at: Date;
  accepted: boolean;
};
