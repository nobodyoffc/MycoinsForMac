import {CoinType, CoinConfig} from './types';

export const COINS: Record<CoinType, CoinConfig> = {
  [CoinType.BTC]: {
    type: CoinType.BTC,
    name: 'Bitcoin',
    ticker: 'BTC',
    decimals: 8,
    model: 'utxo',
    addressVersion: 0x00,
    scriptVersion: 0x05,
    wifVersion: 0x80,
  },
  [CoinType.BCH]: {
    type: CoinType.BCH,
    name: 'Bitcoin Cash',
    ticker: 'BCH',
    decimals: 8,
    model: 'utxo',
    addressVersion: 0x00, // CashAddr uses its own encoding
    scriptVersion: 0x05,
    wifVersion: 0x80,
  },
  [CoinType.FCH]: {
    type: CoinType.FCH,
    name: 'Freecash',
    ticker: 'FCH',
    decimals: 8,
    model: 'utxo',
    addressVersion: 0x23,
    scriptVersion: 0x05, // TODO: confirm FCH script version
    wifVersion: 0x80,
  },
  [CoinType.DOGE]: {
    type: CoinType.DOGE,
    name: 'Dogecoin',
    ticker: 'DOGE',
    decimals: 8,
    model: 'utxo',
    addressVersion: 0x1e,
    scriptVersion: 0x16,
    wifVersion: 0x9e,
  },
  [CoinType.ETH]: {
    type: CoinType.ETH,
    name: 'Ethereum',
    ticker: 'ETH',
    decimals: 18,
    model: 'account',
  },
  [CoinType.USDT]: {
    type: CoinType.USDT,
    name: 'Tether',
    ticker: 'USDT',
    decimals: 6,
    model: 'account',
    contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  [CoinType.USDC]: {
    type: CoinType.USDC,
    name: 'USD Coin',
    ticker: 'USDC',
    decimals: 6,
    model: 'account',
    contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
};

export const ALL_COINS = Object.values(COINS);
export const UTXO_COINS = ALL_COINS.filter(c => c.model === 'utxo');
export const ACCOUNT_COINS = ALL_COINS.filter(c => c.model === 'account');
