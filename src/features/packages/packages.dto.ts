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
  walletPaise: number;
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

/** The value of one session of a package, rounded to the nearest paisa. */
export const sessionValuePaise = (pricePaise: number, sessions: number) => Math.round(pricePaise / sessions);
