import * as secp from '@noble/secp256k1';
import {sha256 as nobleSha256} from '@noble/hashes/sha2.js';
import {hmac} from '@noble/hashes/hmac.js';
import {sha256} from './hash';
import {decodeWIF, utf8ToBytes} from './encoding';

// Wire up sync hashes for secp256k1 signing
secp.hashes.sha256 = nobleSha256;
secp.hashes.hmacSha256 = (key: Uint8Array, msg: Uint8Array) =>
  hmac(nobleSha256, key, msg);

export function generateRandomPrivateKey(): Uint8Array {
  return secp.utils.randomSecretKey();
}

export function isValidPrivateKey(key: Uint8Array): boolean {
  return secp.utils.isValidSecretKey(key);
}

export function privateKeyFromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length !== 64) {
    throw new Error('Prikey hex must be 64 characters (32 bytes)');
  }
  const key = new Uint8Array(
    clean.match(/.{2}/g)!.map(b => parseInt(b, 16)),
  );
  if (!isValidPrivateKey(key)) {
    throw new Error('Invalid prikey: not on secp256k1 curve');
  }
  return key;
}

export function privateKeyFromWIF(wif: string): {
  key: Uint8Array;
  compressed: boolean;
} {
  const {key, compressed} = decodeWIF(wif);
  if (!isValidPrivateKey(key)) {
    throw new Error('Invalid prikey from WIF: not on secp256k1 curve');
  }
  return {key, compressed};
}

export function privateKeyFromSecret(secret: string): Uint8Array {
  const key = sha256(utf8ToBytes(secret));
  if (!isValidPrivateKey(key)) {
    throw new Error(
      'Derived key is invalid (extremely rare). Try a different secret.',
    );
  }
  return key;
}

export function getPublicKey(
  privateKey: Uint8Array,
  compressed: boolean = true,
): Uint8Array {
  return secp.getPublicKey(privateKey, compressed);
}

export function isValidPublicKey(
  publicKey: Uint8Array,
  compressed?: boolean,
): boolean {
  return secp.utils.isValidPublicKey(publicKey, compressed);
}

export function publicKeyFromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(
    clean.match(/.{2}/g)!.map(b => parseInt(b, 16)),
  );
  if (!isValidPublicKey(bytes)) {
    throw new Error('Invalid public key');
  }
  return bytes;
}

// Re-export sign for transaction building
export const sign = secp.sign;
export const signAsync = secp.signAsync;
