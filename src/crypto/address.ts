import {Point} from '@noble/secp256k1';
import {hash160, keccak256} from './hash';
import {getPublicKey} from './keys';
import {toBase58Check, encodeCashAddr, bytesToHex} from './encoding';
import {CoinType} from '../coins/types';

export {CoinType};

// Address version bytes for UTXO coins
const ADDRESS_VERSIONS: Partial<Record<CoinType, number>> = {
  [CoinType.BTC]: 0x00,
  [CoinType.FCH]: 0x23,
  [CoinType.DOGE]: 0x1e,
};

export function pubKeyToAddress(
  pubKey: Uint8Array,
  coin: CoinType,
): string {
  switch (coin) {
    case CoinType.BTC:
    case CoinType.FCH:
    case CoinType.DOGE: {
      const h = hash160(pubKey);
      return toBase58Check(h, ADDRESS_VERSIONS[coin]!);
    }
    case CoinType.BCH: {
      const h = hash160(pubKey);
      return encodeCashAddr('bitcoincash', h);
    }
    case CoinType.ETH:
    case CoinType.USDT:
    case CoinType.USDC: {
      // ETH address uses uncompressed public key (without 0x04 prefix)
      let uncompressed: Uint8Array;
      if (pubKey.length === 33) {
        const point = Point.fromBytes(pubKey);
        uncompressed = point.toBytes(false);
      } else {
        uncompressed = pubKey;
      }
      // Remove 0x04 prefix, then keccak256, take last 20 bytes
      const pubKeyNoPrefix = uncompressed.slice(1);
      const hashed = keccak256(pubKeyNoPrefix);
      const addressBytes = hashed.slice(12);
      return '0x' + bytesToHex(addressBytes);
    }
    default:
      throw new Error(`Unsupported coin type: ${coin}`);
  }
}

export function privateKeyToAddresses(
  privateKey: Uint8Array,
): Record<CoinType, string> {
  const compressedPubKey = getPublicKey(privateKey, true);

  const addresses: Partial<Record<CoinType, string>> = {};

  // UTXO coins use compressed pubkey
  addresses[CoinType.BTC] = pubKeyToAddress(compressedPubKey, CoinType.BTC);
  addresses[CoinType.BCH] = pubKeyToAddress(compressedPubKey, CoinType.BCH);
  addresses[CoinType.FCH] = pubKeyToAddress(compressedPubKey, CoinType.FCH);
  addresses[CoinType.DOGE] = pubKeyToAddress(compressedPubKey, CoinType.DOGE);

  // ETH uses uncompressed pubkey (handled inside pubKeyToAddress)
  addresses[CoinType.ETH] = pubKeyToAddress(compressedPubKey, CoinType.ETH);
  addresses[CoinType.USDT] = addresses[CoinType.ETH];
  addresses[CoinType.USDC] = addresses[CoinType.ETH];

  return addresses as Record<CoinType, string>;
}

export function publicKeyToAddresses(
  pubKey: Uint8Array,
): Record<CoinType, string> {
  const addresses: Partial<Record<CoinType, string>> = {};

  addresses[CoinType.BTC] = pubKeyToAddress(pubKey, CoinType.BTC);
  addresses[CoinType.BCH] = pubKeyToAddress(pubKey, CoinType.BCH);
  addresses[CoinType.FCH] = pubKeyToAddress(pubKey, CoinType.FCH);
  addresses[CoinType.DOGE] = pubKeyToAddress(pubKey, CoinType.DOGE);
  addresses[CoinType.ETH] = pubKeyToAddress(pubKey, CoinType.ETH);
  addresses[CoinType.USDT] = addresses[CoinType.ETH];
  addresses[CoinType.USDC] = addresses[CoinType.ETH];

  return addresses as Record<CoinType, string>;
}
