/**
 * RLP (Recursive Length Prefix) encoding for Ethereum transactions.
 * Implements the encoding side only (no decoding needed for TX building).
 */

export type RLPInput = Uint8Array | RLPInput[];

export function encodeRLP(input: RLPInput): Uint8Array {
  if (input instanceof Uint8Array) {
    return encodeBytes(input);
  }
  return encodeList(input);
}

function encodeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && bytes[0] < 0x80) {
    // Single byte < 0x80: encoded as itself
    return bytes;
  }
  if (bytes.length <= 55) {
    // Short string: 0x80 + length, then data
    const out = new Uint8Array(1 + bytes.length);
    out[0] = 0x80 + bytes.length;
    out.set(bytes, 1);
    return out;
  }
  // Long string: 0xb7 + length-of-length, then length, then data
  const lenBytes = encodeLength(bytes.length);
  const out = new Uint8Array(1 + lenBytes.length + bytes.length);
  out[0] = 0xb7 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(bytes, 1 + lenBytes.length);
  return out;
}

function encodeList(items: RLPInput[]): Uint8Array {
  const encodedItems = items.map(item => encodeRLP(item));
  const totalLen = encodedItems.reduce((s, e) => s + e.length, 0);

  if (totalLen <= 55) {
    const out = new Uint8Array(1 + totalLen);
    out[0] = 0xc0 + totalLen;
    let offset = 1;
    for (const enc of encodedItems) {
      out.set(enc, offset);
      offset += enc.length;
    }
    return out;
  }

  const lenBytes = encodeLength(totalLen);
  const out = new Uint8Array(1 + lenBytes.length + totalLen);
  out[0] = 0xf7 + lenBytes.length;
  out.set(lenBytes, 1);
  let offset = 1 + lenBytes.length;
  for (const enc of encodedItems) {
    out.set(enc, offset);
    offset += enc.length;
  }
  return out;
}

function encodeLength(len: number): Uint8Array {
  if (len <= 0xff) {
    return new Uint8Array([len]);
  }
  if (len <= 0xffff) {
    return new Uint8Array([len >> 8, len & 0xff]);
  }
  if (len <= 0xffffff) {
    return new Uint8Array([(len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }
  return new Uint8Array([
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
  ]);
}

// --- Helper: encode bigint/number to minimal big-endian bytes ---

export function bigintToRLPBytes(value: bigint): Uint8Array {
  if (value === 0n) {
    return new Uint8Array(0); // RLP encodes 0 as empty bytes
  }
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function numberToRLPBytes(value: number): Uint8Array {
  return bigintToRLPBytes(BigInt(value));
}
