/**
 * Ethereum EIP-1559 (Type 2) transaction builder.
 * Builds, signs, and serializes ETH transactions locally.
 */

import {encodeRLP, bigintToRLPBytes, numberToRLPBytes, RLPInput} from './rlp';
import {keccak256} from '../../crypto/hash';
import {sign} from '../../crypto/keys';
import {hexToBytes, bytesToHex} from '../../crypto/encoding';

export interface EthTxParams {
  chainId: number;
  nonce: number;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  to: string; // 0x-prefixed address
  value: bigint;
  data: Uint8Array; // empty for plain ETH transfer
}

export interface SignedEthTx {
  txHash: string;
  rawHex: string; // 0x-prefixed
}

function addressToBytes(address: string): Uint8Array {
  const clean = address.startsWith('0x') ? address.slice(2) : address;
  return hexToBytes(clean);
}

/**
 * Build the unsigned EIP-1559 transaction payload for signing.
 * Format: 0x02 || RLP([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList])
 */
function buildUnsignedPayload(params: EthTxParams): Uint8Array {
  const fields: RLPInput[] = [
    bigintToRLPBytes(BigInt(params.chainId)),
    numberToRLPBytes(params.nonce),
    bigintToRLPBytes(params.maxPriorityFeePerGas),
    bigintToRLPBytes(params.maxFeePerGas),
    bigintToRLPBytes(params.gasLimit),
    addressToBytes(params.to),
    bigintToRLPBytes(params.value),
    params.data,
    [], // accessList (empty)
  ];

  const rlpEncoded = encodeRLP(fields);

  // Prepend type byte 0x02
  const payload = new Uint8Array(1 + rlpEncoded.length);
  payload[0] = 0x02;
  payload.set(rlpEncoded, 1);

  return payload;
}

/**
 * Sign an EIP-1559 transaction.
 */
export function signEthTransaction(
  params: EthTxParams,
  privateKey: Uint8Array,
): SignedEthTx {
  // 1. Build unsigned payload
  const unsignedPayload = buildUnsignedPayload(params);

  // 2. Hash the unsigned payload with keccak256
  const msgHash = keccak256(unsignedPayload);

  // 3. Sign with secp256k1 ECDSA, requesting the recovery id.
  // noble's 'recovered' format returns [recovery(1) || r(32) || s(32)] and
  // already normalizes s to low-S, flipping the recovery bit to match. The
  // recovery id IS the EIP-1559 v value (0 or 1) — it must be the parity that
  // recovers our public key, otherwise the node derives the wrong `from`
  // address (recovering an empty account → "insufficient funds, have 0").
  const sigBytes = sign(msgHash, privateKey, {
    prehash: false,
    format: 'recovered',
  });
  const recoveryId = sigBytes[0];
  const rBigInt = bytesToBigInt(sigBytes.slice(1, 33));
  const sBigInt = bytesToBigInt(sigBytes.slice(33, 65));

  // 4. Build signed transaction
  // 0x02 || RLP([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, v, r, s])
  const fields: RLPInput[] = [
    bigintToRLPBytes(BigInt(params.chainId)),
    numberToRLPBytes(params.nonce),
    bigintToRLPBytes(params.maxPriorityFeePerGas),
    bigintToRLPBytes(params.maxFeePerGas),
    bigintToRLPBytes(params.gasLimit),
    addressToBytes(params.to),
    bigintToRLPBytes(params.value),
    params.data,
    [], // accessList
    bigintToRLPBytes(BigInt(recoveryId)), // v (0 or 1)
    bigintToRLPBytes(rBigInt),
    bigintToRLPBytes(sBigInt),
  ];

  const rlpEncoded = encodeRLP(fields);
  const signedTx = new Uint8Array(1 + rlpEncoded.length);
  signedTx[0] = 0x02;
  signedTx.set(rlpEncoded, 1);

  // 5. Compute tx hash
  const txHash = keccak256(signedTx);

  return {
    txHash: '0x' + bytesToHex(txHash),
    rawHex: '0x' + bytesToHex(signedTx),
  };
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b);
  }
  return result;
}

/**
 * Build a simple ETH transfer transaction.
 */
export function buildEthTransfer(params: {
  chainId?: number;
  nonce: number;
  to: string;
  value: bigint; // in wei
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit?: bigint;
  privateKey: Uint8Array;
}): SignedEthTx {
  return signEthTransaction(
    {
      chainId: params.chainId || 1,
      nonce: params.nonce,
      maxPriorityFeePerGas: params.maxPriorityFeePerGas,
      maxFeePerGas: params.maxFeePerGas,
      gasLimit: params.gasLimit || 21000n, // standard ETH transfer
      to: params.to,
      value: params.value,
      data: new Uint8Array(0),
    },
    params.privateKey,
  );
}
