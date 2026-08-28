/**
 * FCH/BCH Schnorr signature implementation.
 *
 * Based on the FC-JDK SchnorrSignature.java reference:
 *
 * Signing:
 *   k0 = SHA256(sk || msg) mod n
 *   R = k0 * G
 *   k = jacobi(R.y) != 1 ? n - k0 : k0
 *   e = SHA256(R.x || pubkey_compressed || msg) mod n
 *   s = (e * sk + k) mod n
 *   sig = R.x || s (64 bytes)
 *
 * Verification:
 *   e = SHA256(R.x || pubkey || msg) mod n
 *   check: s*G == R + (-e)*P  (where jacobi(R.y) == 1)
 */

import {Point} from '@noble/secp256k1';
import * as secp from '@noble/secp256k1';
import {sha256} from './hash';
import {bytesToHex, hexToBytes} from './encoding';

const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const P_FIELD = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;

function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b);
  }
  return result;
}

function bigIntToBytes32(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0');
  return hexToBytes(hex);
}

/**
 * Compute the Jacobi symbol (a/p) for prime p.
 * Returns 1, -1, or 0.
 */
function jacobi(a: bigint, p: bigint): number {
  a = mod(a, p);
  let result = 1;
  while (a !== 0n) {
    while (a % 2n === 0n) {
      a = a / 2n;
      const pMod8 = p % 8n;
      if (pMod8 === 3n || pMod8 === 5n) {
        result = -result;
      }
    }
    [a, p] = [p, a];
    if (a % 4n === 3n && p % 4n === 3n) {
      result = -result;
    }
    a = mod(a, p);
  }
  return p === 1n ? result : 0;
}

/**
 * Sign a 32-byte message hash using FCH/BCH Schnorr.
 * Returns 64-byte signature (R.x || s).
 */
export function signSchnorrBCH(
  messageHash: Uint8Array,
  privateKey: Uint8Array,
): Uint8Array {
  const sk = bytesToBigInt(privateKey);

  // k0 = SHA256(sk || msg) mod n
  const kInput = new Uint8Array(32 + 32);
  kInput.set(privateKey, 0);
  kInput.set(messageHash, 32);
  const k0Hash = sha256(kInput);
  let k0 = mod(bytesToBigInt(k0Hash), N);
  if (k0 === 0n) {
    throw new Error('Schnorr signing failed: k0 is zero');
  }

  // R = k0 * G
  const R = Point.BASE.multiply(k0);
  const rAffine = R.toAffine();

  // k = jacobi(R.y, p) != 1 ? n - k0 : k0
  const k = jacobi(rAffine.y, P_FIELD) !== 1 ? N - k0 : k0;

  const rX = bigIntToBytes32(rAffine.x);

  // pubkey (compressed)
  const pubKey = secp.getPublicKey(privateKey, true);

  // e = SHA256(R.x || pubkey || msg) mod n
  const eInput = new Uint8Array(32 + 33 + 32);
  eInput.set(rX, 0);
  eInput.set(pubKey, 32);
  eInput.set(messageHash, 65);
  const eHash = sha256(eInput);
  const e = mod(bytesToBigInt(eHash), N);

  // s = (e * sk + k) mod n
  const s = mod(e * sk + k, N);

  // sig = R.x || s
  const sig = new Uint8Array(64);
  sig.set(rX, 0);
  sig.set(bigIntToBytes32(s), 32);
  return sig;
}

/**
 * Verify a FCH/BCH Schnorr signature.
 */
export function verifySchnorrBCH(
  signature: Uint8Array,
  messageHash: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== 64) {
    return false;
  }

  const rX = bytesToBigInt(signature.slice(0, 32));
  const s = bytesToBigInt(signature.slice(32, 64));

  if (s >= N) {
    return false;
  }

  // e = SHA256(R.x || pubkey || msg) mod n
  const eInput = new Uint8Array(32 + 33 + 32);
  eInput.set(signature.slice(0, 32), 0);
  eInput.set(publicKey, 32);
  eInput.set(messageHash, 65);
  const eHash = sha256(eInput);
  const e = mod(bytesToBigInt(eHash), N);

  // Verify: s*G = R + (-e)*P
  // => R = s*G - (-e)*P = s*G + e*P ... no wait
  // s*G should equal R + (-e)*P, so R = s*G - (-e)*P = s*G + e*P
  // Actually: s = e*sk + k, so s*G = e*sk*G + k*G = e*P + R
  // Therefore: R = s*G - e*P (= s*G + (-e)*P)
  const P = Point.fromBytes(publicKey);
  const sG = s === 0n ? Point.ZERO : Point.BASE.multiply(s);
  const eP = e === 0n ? Point.ZERO : P.multiply(e);
  const Rprime = sG.add(eP.negate());

  if (Rprime.equals(Point.ZERO)) {
    return false;
  }

  const rpAffine = Rprime.toAffine();

  // Check R'.x == r and jacobi(R'.y) == 1
  return rpAffine.x === rX && jacobi(rpAffine.y, P_FIELD) === 1;
}
