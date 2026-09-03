export interface ScannedPayment {
  address: string;
  /** Decimal amount carried by the URI, if it had one. */
  amount?: string;
  /** Free-text label/message carried by the URI, if it had one. */
  memo?: string;
}

/** Address schemes we recognise; anything else is treated as a bare address. */
const PAYMENT_SCHEMES = [
  'bitcoin',
  'bitcoincash',
  'freecash',
  'fch',
  'dogecoin',
  'ethereum',
  'litecoin',
];

/**
 * Normalise a scanned recipient into an address plus whatever extras the code
 * carried. Handles BIP-21 style URIs (`bitcoin:addr?amount=1.5&label=x`) and
 * EIP-681 chain suffixes (`ethereum:0xabc@1`), and falls back to returning the
 * text unchanged so an unadorned address still works.
 */
export function parsePaymentTarget(raw: string): ScannedPayment {
  const text = raw.trim();
  const colon = text.indexOf(':');

  if (colon <= 0) return {address: text};

  const scheme = text.slice(0, colon).toLowerCase();
  if (!PAYMENT_SCHEMES.includes(scheme)) return {address: text};

  const rest = text.slice(colon + 1);
  const query = rest.indexOf('?');
  let address = query === -1 ? rest : rest.slice(0, query);

  // EIP-681 appends a chain id (`0xabc@1`) and may append a function call.
  const at = address.indexOf('@');
  if (at !== -1) address = address.slice(0, at);
  const slash = address.indexOf('/');
  if (slash !== -1) address = address.slice(0, slash);

  const result: ScannedPayment = {address: address.trim()};
  if (query === -1) return result;

  const params = new URLSearchParams(rest.slice(query + 1));
  const amount = params.get('amount') ?? params.get('value');
  if (amount && /^\d*\.?\d+$/.test(amount.trim())) {
    result.amount = amount.trim();
  }
  const memo = params.get('message') ?? params.get('label');
  if (memo) result.memo = memo;

  return result;
}
