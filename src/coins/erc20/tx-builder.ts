/**
 * ERC-20 token transfer transaction builder.
 * Builds ETH transactions with ABI-encoded transfer(address, uint256) calls.
 */

import {signEthTransaction, EthTxParams, SignedEthTx} from '../eth/tx-builder';
import {hexToBytes} from '../../crypto/encoding';

// ERC-20 transfer(address,uint256) function selector
// keccak256("transfer(address,uint256)") = 0xa9059cbb...
const TRANSFER_SELECTOR = 'a9059cbb';

/**
 * ABI-encode a transfer(address, uint256) call.
 * Returns the data field for an ETH transaction.
 */
export function encodeTransferData(
  toAddress: string,
  amount: bigint,
): Uint8Array {
  const clean = toAddress.startsWith('0x') ? toAddress.slice(2) : toAddress;

  // 4 bytes selector + 32 bytes address (left-padded) + 32 bytes amount
  const data = new Uint8Array(4 + 32 + 32);

  // Function selector
  const selector = hexToBytes(TRANSFER_SELECTOR);
  data.set(selector, 0);

  // Address parameter (32 bytes, left-padded with zeros)
  const addrBytes = hexToBytes(clean.padStart(64, '0'));
  data.set(addrBytes, 4);

  // Amount parameter (32 bytes, big-endian)
  let amountHex = amount.toString(16).padStart(64, '0');
  const amountBytes = hexToBytes(amountHex);
  data.set(amountBytes, 36);

  return data;
}

/**
 * Build an ERC-20 transfer transaction.
 */
export function buildErc20Transfer(params: {
  chainId?: number;
  nonce: number;
  contractAddress: string; // ERC-20 contract address
  toAddress: string; // recipient
  amount: bigint; // token amount in smallest unit
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit?: bigint;
  privateKey: Uint8Array;
}): SignedEthTx {
  const data = encodeTransferData(params.toAddress, params.amount);

  return signEthTransaction(
    {
      chainId: params.chainId || 1,
      nonce: params.nonce,
      maxPriorityFeePerGas: params.maxPriorityFeePerGas,
      maxFeePerGas: params.maxFeePerGas,
      gasLimit: params.gasLimit || 65000n, // ERC-20 transfers typically need ~60k gas
      to: params.contractAddress,
      value: 0n, // no ETH value for token transfer
      data,
    },
    params.privateKey,
  );
}

// Well-known ERC-20 contract addresses (Ethereum mainnet)
export const ERC20_CONTRACTS = {
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
};
