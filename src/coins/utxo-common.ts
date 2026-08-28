/**
 * Common UTXO transaction building primitives.
 * Pure TypeScript — no bitcoinjs-lib dependency.
 */

import {doubleSha256, sha256, hash160} from '../crypto/hash';
import {sign} from '../crypto/keys';
import {signSchnorrBCH} from '../crypto/schnorr-bch';
import {bytesToHex, hexToBytes} from '../crypto/encoding';

// --- Buffer write helpers (little-endian) ---

export class TxWriter {
  private parts: Uint8Array[] = [];

  writeUint8(v: number): void {
    this.parts.push(new Uint8Array([v & 0xff]));
  }

  writeUint16LE(v: number): void {
    const buf = new Uint8Array(2);
    buf[0] = v & 0xff;
    buf[1] = (v >> 8) & 0xff;
    this.parts.push(buf);
  }

  writeUint32LE(v: number): void {
    const buf = new Uint8Array(4);
    buf[0] = v & 0xff;
    buf[1] = (v >> 8) & 0xff;
    buf[2] = (v >> 16) & 0xff;
    buf[3] = (v >> 24) & 0xff;
    this.parts.push(buf);
  }

  writeUint64LE(v: number): void {
    const buf = new Uint8Array(8);
    const lo = v & 0xffffffff;
    const hi = Math.floor(v / 0x100000000) & 0xffffffff;
    buf[0] = lo & 0xff;
    buf[1] = (lo >> 8) & 0xff;
    buf[2] = (lo >> 16) & 0xff;
    buf[3] = (lo >> 24) & 0xff;
    buf[4] = hi & 0xff;
    buf[5] = (hi >> 8) & 0xff;
    buf[6] = (hi >> 16) & 0xff;
    buf[7] = (hi >> 24) & 0xff;
    this.parts.push(buf);
  }

  writeVarInt(v: number): void {
    if (v < 0xfd) {
      this.writeUint8(v);
    } else if (v <= 0xffff) {
      this.writeUint8(0xfd);
      this.writeUint16LE(v);
    } else if (v <= 0xffffffff) {
      this.writeUint8(0xfe);
      this.writeUint32LE(v);
    } else {
      this.writeUint8(0xff);
      this.writeUint64LE(v);
    }
  }

  writeBytes(data: Uint8Array): void {
    this.parts.push(data);
  }

  writeVarBytes(data: Uint8Array): void {
    this.writeVarInt(data.length);
    this.writeBytes(data);
  }

  // Write a reversed hash (txid is stored as little-endian in raw TX)
  writeReversedHash(hex: string): void {
    const bytes = hexToBytes(hex);
    const reversed = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      reversed[i] = bytes[bytes.length - 1 - i];
    }
    this.writeBytes(reversed);
  }

  toBytes(): Uint8Array {
    const totalLen = this.parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of this.parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  toHex(): string {
    return bytesToHex(this.toBytes());
  }
}

// --- Script helpers ---

export function p2pkhScript(pubKeyHash: Uint8Array): Uint8Array {
  // OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG
  const script = new Uint8Array(25);
  script[0] = 0x76; // OP_DUP
  script[1] = 0xa9; // OP_HASH160
  script[2] = 0x14; // push 20 bytes
  script.set(pubKeyHash, 3);
  script[23] = 0x88; // OP_EQUALVERIFY
  script[24] = 0xac; // OP_CHECKSIG
  return script;
}

export function p2pkhScriptFromAddress(
  address: string,
  decodeAddress: (addr: string) => Uint8Array,
): Uint8Array {
  const pubKeyHash = decodeAddress(address);
  return p2pkhScript(pubKeyHash);
}

// --- DER signature encoding ---

function encodeDER(r: Uint8Array, s: Uint8Array): Uint8Array {
  // Trim leading zeros but ensure high bit doesn't make it negative
  function trimAndPad(v: Uint8Array): Uint8Array {
    let start = 0;
    while (start < v.length - 1 && v[start] === 0) {
      start++;
    }
    const trimmed = v.slice(start);
    if (trimmed[0] & 0x80) {
      const padded = new Uint8Array(trimmed.length + 1);
      padded[0] = 0;
      padded.set(trimmed, 1);
      return padded;
    }
    return trimmed;
  }

  const rEnc = trimAndPad(r);
  const sEnc = trimAndPad(s);
  const totalLen = 2 + rEnc.length + 2 + sEnc.length;

  const der = new Uint8Array(2 + totalLen);
  let i = 0;
  der[i++] = 0x30; // SEQUENCE
  der[i++] = totalLen;
  der[i++] = 0x02; // INTEGER
  der[i++] = rEnc.length;
  der.set(rEnc, i);
  i += rEnc.length;
  der[i++] = 0x02; // INTEGER
  der[i++] = sEnc.length;
  der.set(sEnc, i);

  return der;
}

// --- Transaction types ---

export interface TxInput {
  txid: string;
  vout: number;
  value: number; // satoshis (needed for BIP143/SIGHASH_FORKID)
  scriptPubKey?: string; // hex, the locking script to satisfy
}

export interface TxOutput {
  address: string;
  value: number; // satoshis
  script?: Uint8Array; // raw output script; overrides address (e.g. OP_RETURN)
}

// --- OP_RETURN ---

// Build an OP_RETURN locking script: OP_RETURN <pushdata> <data>
export function opReturnScript(data: Uint8Array): Uint8Array {
  const w = new TxWriter();
  w.writeUint8(0x6a); // OP_RETURN
  if (data.length < 0x4c) {
    w.writeUint8(data.length); // direct push (0x01..0x4b)
  } else if (data.length <= 0xff) {
    w.writeUint8(0x4c); // OP_PUSHDATA1
    w.writeUint8(data.length);
  } else if (data.length <= 0xffff) {
    w.writeUint8(0x4d); // OP_PUSHDATA2
    w.writeUint16LE(data.length);
  } else {
    throw new Error('OP_RETURN data too large');
  }
  w.writeBytes(data);
  return w.toBytes();
}

// Build an OP_RETURN output from UTF-8 text (value is always 0).
export function opReturnOutput(text: string): TxOutput {
  const data = new TextEncoder().encode(text);
  return {address: '', value: 0, script: opReturnScript(data)};
}

// Resolve the locking script for an output: explicit raw script or P2PKH.
function outputScript(
  out: TxOutput,
  decodeAddress: (addr: string) => Uint8Array,
): Uint8Array {
  return out.script ?? p2pkhScript(decodeAddress(out.address));
}

export interface SignedTxResult {
  txid: string;
  rawHex: string;
}

// --- UTXO selection ---

export function selectUTXOs(
  utxos: TxInput[],
  targetAmount: number,
  feeRate: number, // sat/byte
  outputCount: number = 2, // target + change
  extraBytes: number = 0, // additional output bytes, e.g. OP_RETURN
): {selected: TxInput[]; fee: number} {
  // Sort by value descending
  const sorted = [...utxos].sort((a, b) => b.value - a.value);

  const selected: TxInput[] = [];
  let totalInput = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    totalInput += utxo.value;

    // Estimate tx size: ~148 bytes per input + ~34 bytes per output + ~10 overhead
    const estimatedSize =
      selected.length * 148 + outputCount * 34 + extraBytes + 10;
    const fee = estimatedSize * feeRate;

    if (totalInput >= targetAmount + fee) {
      return {selected, fee};
    }
  }

  throw new Error(
    `Insufficient funds: need ${targetAmount} + fee, have ${totalInput}`,
  );
}

// --- BTC-style signing (legacy sighash) ---

export function signBtcTransaction(
  inputs: TxInput[],
  outputs: TxOutput[],
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  decodeAddress: (addr: string) => Uint8Array,
  txVersion: number = 2,
  lockTime: number = 0,
): SignedTxResult {
  const sighashType = 0x01; // SIGHASH_ALL

  // For each input, create the signature
  const signatures: Uint8Array[] = [];

  for (let i = 0; i < inputs.length; i++) {
    // Build the unsigned TX with the current input's scriptPubKey
    const preimage = new TxWriter();
    preimage.writeUint32LE(txVersion);
    preimage.writeVarInt(inputs.length);

    for (let j = 0; j < inputs.length; j++) {
      preimage.writeReversedHash(inputs[j].txid);
      preimage.writeUint32LE(inputs[j].vout);
      if (i === j) {
        // Insert the scriptPubKey of the input being signed
        const scriptPK = inputs[j].scriptPubKey
          ? hexToBytes(inputs[j].scriptPubKey!)
          : p2pkhScript(hash160(publicKey));
        preimage.writeVarBytes(scriptPK);
      } else {
        preimage.writeVarInt(0); // empty script for other inputs
      }
      preimage.writeUint32LE(0xffffffff); // sequence
    }

    preimage.writeVarInt(outputs.length);
    for (const out of outputs) {
      preimage.writeUint64LE(out.value);
      preimage.writeVarBytes(outputScript(out, decodeAddress));
    }

    preimage.writeUint32LE(lockTime);
    preimage.writeUint32LE(sighashType); // append sighash type

    const preimageBytes = preimage.toBytes();
    const hash = doubleSha256(preimageBytes);

    // Sign with secp256k1 (prehash: false since we already hashed)
    const sigBytes = sign(hash, privateKey, {prehash: false});
    // sigBytes is 64 bytes compact (r || s)
    const r = sigBytes.slice(0, 32);
    const s = sigBytes.slice(32, 64);
    const der = encodeDER(r, s);

    // scriptSig = <DER sig + hashtype> <pubkey>
    const sigWithHashType = new Uint8Array(der.length + 1);
    sigWithHashType.set(der);
    sigWithHashType[der.length] = sighashType;

    signatures.push(sigWithHashType);
  }

  // Build the final signed transaction
  const tx = new TxWriter();
  tx.writeUint32LE(txVersion);
  tx.writeVarInt(inputs.length);

  for (let i = 0; i < inputs.length; i++) {
    tx.writeReversedHash(inputs[i].txid);
    tx.writeUint32LE(inputs[i].vout);
    // scriptSig: <sig> <pubkey>
    const scriptSig = new TxWriter();
    scriptSig.writeVarBytes(signatures[i]);
    scriptSig.writeVarBytes(publicKey);
    const scriptSigBytes = scriptSig.toBytes();
    tx.writeVarBytes(scriptSigBytes);
    tx.writeUint32LE(0xffffffff); // sequence
  }

  tx.writeVarInt(outputs.length);
  for (const out of outputs) {
    tx.writeUint64LE(out.value);
    tx.writeVarBytes(outputScript(out, decodeAddress));
  }

  tx.writeUint32LE(lockTime);

  const rawBytes = tx.toBytes();
  const rawHex = bytesToHex(rawBytes);
  const txidBytes = doubleSha256(rawBytes);
  // txid is displayed as big-endian (reversed)
  const txidReversed = new Uint8Array(txidBytes.length);
  for (let i = 0; i < txidBytes.length; i++) {
    txidReversed[i] = txidBytes[txidBytes.length - 1 - i];
  }

  return {
    txid: bytesToHex(txidReversed),
    rawHex,
  };
}

// --- BCH/FCH signing (BIP143 + SIGHASH_FORKID) ---

export function signBchTransaction(
  inputs: TxInput[],
  outputs: TxOutput[],
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  decodeAddress: (addr: string) => Uint8Array,
  forkId: number = 0,
  txVersion: number = 2,
  lockTime: number = 0,
): SignedTxResult {
  // SIGHASH_ALL | SIGHASH_FORKID
  const sighashType = 0x41; // 0x01 | 0x40

  // BIP143 preimage components (computed once for all inputs)

  // hashPrevouts = sha256d(all prevouts)
  const prevoutsWriter = new TxWriter();
  for (const inp of inputs) {
    prevoutsWriter.writeReversedHash(inp.txid);
    prevoutsWriter.writeUint32LE(inp.vout);
  }
  const hashPrevouts = doubleSha256(prevoutsWriter.toBytes());

  // hashSequence = sha256d(all sequences)
  const seqWriter = new TxWriter();
  for (let i = 0; i < inputs.length; i++) {
    seqWriter.writeUint32LE(0xffffffff);
  }
  const hashSequence = doubleSha256(seqWriter.toBytes());

  // hashOutputs = sha256d(all outputs)
  const outsWriter = new TxWriter();
  for (const out of outputs) {
    outsWriter.writeUint64LE(out.value);
    outsWriter.writeVarBytes(outputScript(out, decodeAddress));
  }
  const hashOutputs = doubleSha256(outsWriter.toBytes());

  const signatures: Uint8Array[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];

    // BIP143 preimage for this input
    const preimage = new TxWriter();
    preimage.writeUint32LE(txVersion); // 1. nVersion
    preimage.writeBytes(hashPrevouts); // 2. hashPrevouts
    preimage.writeBytes(hashSequence); // 3. hashSequence
    // 4. outpoint
    preimage.writeReversedHash(inp.txid);
    preimage.writeUint32LE(inp.vout);
    // 5. scriptCode (P2PKH script of the input)
    const scriptCode = inp.scriptPubKey
      ? hexToBytes(inp.scriptPubKey)
      : p2pkhScript(hash160(publicKey));
    preimage.writeVarBytes(scriptCode);
    // 6. value of the input being spent
    preimage.writeUint64LE(inp.value);
    // 7. nSequence
    preimage.writeUint32LE(0xffffffff);
    preimage.writeBytes(hashOutputs); // 8. hashOutputs
    preimage.writeUint32LE(lockTime); // 9. nLockTime
    // 10. sighash type with fork ID in upper bits
    preimage.writeUint32LE(sighashType | (forkId << 8));

    const preimageBytes = preimage.toBytes();
    const hash = doubleSha256(preimageBytes);

    // FCH/BCH use Schnorr: 64-byte (r||s) + 1-byte hashtype = 65 bytes
    const sigBytes = signSchnorrBCH(hash, privateKey);
    const sigWithHashType = new Uint8Array(65);
    sigWithHashType.set(sigBytes);
    sigWithHashType[64] = sighashType;

    signatures.push(sigWithHashType);
  }

  // Build the final signed transaction (same serialization as BTC)
  const tx = new TxWriter();
  tx.writeUint32LE(txVersion);
  tx.writeVarInt(inputs.length);

  for (let i = 0; i < inputs.length; i++) {
    tx.writeReversedHash(inputs[i].txid);
    tx.writeUint32LE(inputs[i].vout);
    const scriptSig = new TxWriter();
    scriptSig.writeVarBytes(signatures[i]);
    scriptSig.writeVarBytes(publicKey);
    tx.writeVarBytes(scriptSig.toBytes());
    tx.writeUint32LE(0xffffffff);
  }

  tx.writeVarInt(outputs.length);
  for (const out of outputs) {
    tx.writeUint64LE(out.value);
    tx.writeVarBytes(outputScript(out, decodeAddress));
  }

  tx.writeUint32LE(lockTime);

  const rawBytes = tx.toBytes();
  const rawHex = bytesToHex(rawBytes);
  const txidBytes = doubleSha256(rawBytes);
  const txidReversed = new Uint8Array(txidBytes.length);
  for (let i = 0; i < txidBytes.length; i++) {
    txidReversed[i] = txidBytes[txidBytes.length - 1 - i];
  }

  return {
    txid: bytesToHex(txidReversed),
    rawHex,
  };
}
