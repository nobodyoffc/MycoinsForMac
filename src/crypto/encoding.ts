import bs58check from 'bs58check';

// --- Hex <-> Bytes ---

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- UTF-8 ---

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// --- Base58Check ---

export function toBase58Check(hash: Uint8Array, version: number): string {
  const payload = new Uint8Array(1 + hash.length);
  payload[0] = version;
  payload.set(hash, 1);
  return bs58check.encode(payload);
}

export function fromBase58Check(address: string): {
  version: number;
  hash: Uint8Array;
} {
  const payload = bs58check.decode(address);
  return {
    version: payload[0],
    hash: payload.slice(1),
  };
}

// --- WIF (Wallet Import Format) ---

const BTC_WIF_VERSION = 0x80;

export function encodeWIF(
  privateKey: Uint8Array,
  compressed: boolean = true,
  version: number = BTC_WIF_VERSION,
): string {
  const data = compressed
    ? new Uint8Array([version, ...privateKey, 0x01])
    : new Uint8Array([version, ...privateKey]);
  return bs58check.encode(data);
}

export function decodeWIF(wif: string): {
  key: Uint8Array;
  compressed: boolean;
  version: number;
} {
  const decoded = bs58check.decode(wif);
  const version = decoded[0];
  if (decoded.length === 34 && decoded[33] === 0x01) {
    return {key: decoded.slice(1, 33), compressed: true, version};
  }
  if (decoded.length === 33) {
    return {key: decoded.slice(1, 33), compressed: false, version};
  }
  throw new Error('Invalid WIF length');
}

// --- CashAddr (BCH) ---
// Simplified BCH CashAddr implementation (bech32-like with polymod)

const CASHADDR_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values: number[]): bigint {
  const generators: bigint[] = [
    0x98f2bc8e61n,
    0x79b76d99e2n,
    0xf33e5fb3c4n,
    0xae2eabe2a8n,
    0x1e4f43e470n,
  ];
  let chk = 1n;
  for (const v of values) {
    const top = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(v);
    for (let i = 0; i < 5; i++) {
      if ((top >> BigInt(i)) & 1n) {
        chk ^= generators[i];
      }
    }
  }
  return chk ^ 1n;
}

function prefixExpand(prefix: string): number[] {
  const expanded: number[] = [];
  for (let i = 0; i < prefix.length; i++) {
    expanded.push(prefix.charCodeAt(i) & 0x1f);
  }
  expanded.push(0);
  return expanded;
}

function convertBits(
  data: Uint8Array,
  fromBits: number,
  toBits: number,
  pad: boolean,
): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) {
    result.push((acc << (toBits - bits)) & maxv);
  } else if (!pad && bits >= fromBits) {
    throw new Error('Excess padding');
  }
  return result;
}

export function encodeCashAddr(
  prefix: string,
  hash160: Uint8Array,
): string {
  // Type byte: version 0, hash size 20 bytes = 0x00
  const typeByte = 0x00;
  const payload = new Uint8Array([typeByte, ...hash160]);
  const payloadBits = convertBits(payload, 8, 5, true);

  const prefixData = prefixExpand(prefix);
  const checksumInput = [...prefixData, ...payloadBits, 0, 0, 0, 0, 0, 0, 0, 0];
  const checksumValue = polymod(checksumInput);

  const checksumBits: number[] = [];
  for (let i = 0; i < 8; i++) {
    checksumBits.push(Number((checksumValue >> BigInt(5 * (7 - i))) & 0x1fn));
  }

  const encoded = [...payloadBits, ...checksumBits]
    .map(b => CASHADDR_CHARSET[b])
    .join('');

  return `${prefix}:${encoded}`;
}

export function decodeCashAddr(address: string): {
  prefix: string;
  hash: Uint8Array;
} {
  let prefix: string;
  let data: string;

  const colonIndex = address.indexOf(':');
  if (colonIndex === -1) {
    // Assume bitcoincash prefix
    prefix = 'bitcoincash';
    data = address;
  } else {
    prefix = address.substring(0, colonIndex).toLowerCase();
    data = address.substring(colonIndex + 1).toLowerCase();
  }

  const values: number[] = [];
  for (const c of data) {
    const idx = CASHADDR_CHARSET.indexOf(c);
    if (idx === -1) {
      throw new Error(`Invalid CashAddr character: ${c}`);
    }
    values.push(idx);
  }

  const prefixData = prefixExpand(prefix);
  const checkData = [...prefixData, ...values];
  if (polymod(checkData) !== 0n) {
    throw new Error('Invalid CashAddr checksum');
  }

  const payloadBits = values.slice(0, -8);
  const payloadBytes = convertBits(
    new Uint8Array(payloadBits),
    5,
    8,
    false,
  );

  // First byte is type/version, rest is hash
  return {
    prefix,
    hash: new Uint8Array(payloadBytes.slice(1)),
  };
}
