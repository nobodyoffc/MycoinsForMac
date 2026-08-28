export enum CoinType {
  BTC = 'BTC',
  BCH = 'BCH',
  FCH = 'FCH',
  DOGE = 'DOGE',
  ETH = 'ETH',
  USDT = 'USDT',
  USDC = 'USDC',
}

export type CoinModel = 'utxo' | 'account';

export interface CoinConfig {
  type: CoinType;
  name: string;
  ticker: string;
  decimals: number;
  model: CoinModel;
  addressVersion?: number;
  scriptVersion?: number;
  wifVersion?: number;
  contractAddress?: string;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number; // satoshis
  scriptPubKey: string;
}

export interface TxOutput {
  address: string;
  value: number; // satoshis
}

export interface GasEstimate {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface FeeEstimate {
  low: number;
  medium: number;
  high: number;
}

export interface Transaction {
  txid: string;
  coin: CoinType;
  from: string;
  to: string;
  amount: string;
  fee: string;
  timestamp: number;
  confirmations: number;
  direction: 'in' | 'out';
}
