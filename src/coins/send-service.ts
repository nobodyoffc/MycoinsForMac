/**
 * Unified send service that handles building, signing, and broadcasting
 * transactions for all supported coin types.
 */

import {CoinType} from './types';
import {COINS} from './registry';
import {TxInput} from './utxo-common';
import {buildBtcTransaction} from './btc/tx-builder';
import {buildBchTransaction} from './bch/tx-builder';
import {buildFchTransaction} from './fch/tx-builder';
import {buildDogeTransaction} from './doge/tx-builder';
import {buildEthTransfer} from './eth/tx-builder';
import {buildErc20Transfer, ERC20_CONTRACTS} from './erc20/tx-builder';
import {getProvider} from '../api/api-registry';

export interface SendParams {
  coin: CoinType;
  fromAddress: string;
  toAddress: string;
  amount: string; // human-readable amount (e.g. "0.5")
  privateKey: Uint8Array;
  feeRate?: number; // sat/byte for UTXO, ignored for ETH
  opReturn?: string; // optional OP_RETURN text (FCH only)
}

export interface SendResult {
  txid: string;
  rawHex: string;
}

function parseAmount(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const intPart = parts[0] || '0';
  let fracPart = parts[1] || '';
  fracPart = fracPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(intPart + fracPart);
}

export async function sendTransaction(params: SendParams): Promise<SendResult> {
  const config = COINS[params.coin];
  const provider = getProvider(params.coin);

  if (config.model === 'utxo') {
    return sendUTXO(params, provider);
  } else {
    return sendETH(params, provider);
  }
}

// Minimum fee rates per coin (sat/byte)
// DOGE requires ~0.01 DOGE/KB minimum = 10 koinu/byte
// BTC/BCH/FCH: 1 sat/byte is usually enough
const MIN_FEE_RATES: Partial<Record<CoinType, number>> = {
  [CoinType.DOGE]: 10, // 0.01 DOGE per KB
  [CoinType.BTC]: 1,
  [CoinType.BCH]: 1,
  [CoinType.FCH]: 1,
};

async function sendUTXO(params: SendParams, provider: any): Promise<SendResult> {
  const minFeeRate = MIN_FEE_RATES[params.coin] || 1;
  const feeRate = Math.max(params.feeRate || minFeeRate, minFeeRate);
  const {coin, fromAddress, toAddress, amount, privateKey, opReturn} = params;
  const config = COINS[coin];

  console.log(`[sendUTXO] ${coin}: from=${fromAddress}, to=${toAddress}, amount=${amount}`);

  // 1. Fetch UTXOs
  const utxos = await provider.getUTXOs(fromAddress);
  console.log(`[sendUTXO] ${coin}: got ${utxos.length} UTXOs`);
  if (utxos.length === 0) {
    throw new Error(
      'No UTXOs available. If you just sent a transaction, please wait for it to be confirmed and try again.',
    );
  }

  const txInputs: TxInput[] = utxos.map((u: any) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    scriptPubKey: u.scriptPubKey || undefined,
  }));
  console.log(`[sendUTXO] ${coin}: UTXOs:`, txInputs.map(u => `${u.txid.substring(0, 8)}...:${u.vout}=${u.value}`).join(', '));

  const amountSats = Number(parseAmount(amount, config.decimals));
  console.log(`[sendUTXO] ${coin}: amountSats=${amountSats}, decimals=${config.decimals}`);
  const recipients = [{address: toAddress, value: amountSats}];

  // 2. Build and sign
  let result;
  switch (coin) {
    case CoinType.BTC:
      result = buildBtcTransaction({
        utxos: txInputs, recipients, changeAddress: fromAddress,
        feeRate, privateKey,
      });
      break;
    case CoinType.BCH:
      result = buildBchTransaction({
        utxos: txInputs, recipients, changeAddress: fromAddress,
        feeRate, privateKey,
      });
      break;
    case CoinType.FCH:
      result = buildFchTransaction({
        utxos: txInputs, recipients, changeAddress: fromAddress,
        feeRate, privateKey, opReturn,
      });
      break;
    case CoinType.DOGE:
      result = buildDogeTransaction({
        utxos: txInputs, recipients, changeAddress: fromAddress,
        feeRate, privateKey,
      });
      break;
    default:
      throw new Error(`Unsupported UTXO coin: ${coin}`);
  }

  console.log(`[sendUTXO] ${coin}: TX built, txid=${result.txid}, rawHex length=${result.rawHex.length}`);
  console.log(`[sendUTXO] ${coin}: rawHex=${result.rawHex.substring(0, 100)}...`);

  // 3. Broadcast
  try {
    const txid = await provider.broadcastTransaction(result.rawHex);
    console.log(`[sendUTXO] ${coin}: Broadcast OK, txid=${txid}`);
    return {txid, rawHex: result.rawHex};
  } catch (err: any) {
    console.log(`[sendUTXO] ${coin}: Broadcast FAILED: ${err.message}`);
    throw err;
  }
}

async function sendETH(params: SendParams, provider: any): Promise<SendResult> {
  const {coin, fromAddress, toAddress, amount, privateKey} = params;
  const config = COINS[coin];

  // 1. Fetch nonce and gas
  const nonce = await provider.getNonce(fromAddress);
  const gas = await provider.getGasPrice();

  const amountRaw = parseAmount(amount, config.decimals);

  let result;
  if (coin === CoinType.ETH) {
    // Native ETH transfer
    result = buildEthTransfer({
      chainId: 1,
      nonce,
      to: toAddress,
      value: amountRaw,
      maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
      maxFeePerGas: gas.maxFeePerGas,
      privateKey,
    });
  } else {
    // ERC-20 transfer (USDT or USDC)
    const contractAddress = config.contractAddress;
    if (!contractAddress) {
      throw new Error(`No contract address for ${coin}`);
    }
    result = buildErc20Transfer({
      chainId: 1,
      nonce,
      contractAddress,
      toAddress,
      amount: amountRaw,
      maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
      maxFeePerGas: gas.maxFeePerGas,
      privateKey,
    });
  }

  // 2. Broadcast
  const txid = await provider.broadcastTransaction(result.rawHex);
  return {txid, rawHex: result.rawHex};
}
