/** Wallet money expires a year after it was added. */
export const WALLET_VALIDITY_DAYS = 365;
/** Default life of a package when none is set on it. */
export const DEFAULT_PACKAGE_VALIDITY_DAYS = 365;

/** A package on sale: a number of sessions for one price. */
export type PackageDTO = {
  id: string;
  name: string;
  /** Services it can pay for. Empty means any service. */
  serviceIds: string[];
  sessions: number;
  validityDays: number | null;
  pricePaise: number;
  active: boolean;
};

/** One package a client bought. */
export type ClientPackageDTO = {
  id: string;
  clientId: string;
  packageId: string;
  packageName: string;
  serviceIds: string[];
  sessionsTotal: number;
  sessionsLeft: number;
  pricePaise: number;
  /** The part of the price these remaining sessions stand for. */
  valueLeftPaise: number;
  expiresAt: Date | null;
  paymentNote: string | null;
  createdAt: Date;
};

/** One top-up of wallet money. */
export type WalletLotDTO = {
  id: string;
  amountPaise: number;
  remainingPaise: number;
  expiresAt: Date;
  note: string | null;
  createdAt: Date;
};

/** Everything a client can still spend. Expired and used-up items are left out. */
export type CreditSummaryDTO = {
  packages: ClientPackageDTO[];
  lots: WalletLotDTO[];
  /** Money from top-ups: the only money that can pay for a booking directly. */
  walletPaise: number;
  /** What the unused package sessions are worth. It falls by each session's share as sessions are used. */
  packageValuePaise: number;
  /** Everything the client has paid for and not yet used: top-ups plus package value. */
  totalPaise: number;
};

/** One line of what a booking was paid with. */
export type CreditUseDTO = {
  id: string;
  bookingId: string;
  bookingNumber: number;
  kind: "package" | "wallet";
  label: string;
  sessions: number;
  amountPaise: number;
  valuePaise: number;
  returnedAt: Date | null;
  createdAt: Date;
};

/** What a booking took when it was made. */
export type CreditTaken = { session: boolean; walletPaise: number };

/**
 * What is left of a package's price when `left` of its `total` sessions remain. Used sessions are worth the
 * difference between two steps, so the value of all sessions adds up to the price exactly, even when it
 * doesn't divide evenly (₹1,000 over 3 sessions is 333 + 334 + 333).
 */
export const valueLeftPaise = (pricePaise: number, total: number, left: number) => Math.round((pricePaise * left) / total);
