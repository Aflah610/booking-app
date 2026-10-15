export type ClientDTO = {
  id: string;
  name: string;
  phoneE164: string;
  email: string | null;
  whatsappOptIn: boolean;
  notes: string | null;
  createdAt: Date;
};

/** Contact details a booking request carries; matched to an existing client by phone. */
export type ClientContact = { name: string; phoneE164: string; email: string | null; whatsappOptIn: boolean };
