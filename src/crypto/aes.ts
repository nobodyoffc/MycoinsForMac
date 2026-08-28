import {gcm} from '@noble/ciphers/aes.js';
import {bytesToHex, hexToBytes} from './encoding';
import {sha256} from './hash';

function deriveAesKey(symkey: Uint8Array, iv: Uint8Array): Uint8Array {
  const combined = new Uint8Array(symkey.length + iv.length);
  combined.set(symkey);
  combined.set(iv, symkey.length);
  return sha256(combined);
}

export function generateIV(): Uint8Array {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  return iv;
}

export function encrypt(
  plaintext: Uint8Array,
  symkey: Uint8Array,
  iv: Uint8Array,
): Uint8Array {
  const aesKey = deriveAesKey(symkey, iv);
  const cipher = gcm(aesKey, iv);
  return cipher.encrypt(plaintext);
}

export function decrypt(
  ciphertext: Uint8Array,
  symkey: Uint8Array,
  iv: Uint8Array,
): Uint8Array {
  const aesKey = deriveAesKey(symkey, iv);
  const cipher = gcm(aesKey, iv);
  return cipher.decrypt(ciphertext);
}

export function encryptToHex(
  plaintext: Uint8Array,
  symkey: Uint8Array,
): {iv: string; ciphertext: string} {
  const iv = generateIV();
  const encrypted = encrypt(plaintext, symkey, iv);
  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(encrypted),
  };
}

export function decryptFromHex(
  ivHex: string,
  ciphertextHex: string,
  symkey: Uint8Array,
): Uint8Array {
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  return decrypt(ciphertext, symkey, iv);
}
