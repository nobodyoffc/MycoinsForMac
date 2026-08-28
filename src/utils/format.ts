import {CoinType} from '../coins/types';
import {COINS} from '../coins/registry';

export function formatAddress(address: string, prefixLen = 8, suffixLen = 6): string {
  if (address.length <= prefixLen + suffixLen + 3) {
    return address;
  }
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}

export function formatBalance(raw: string, decimals: number): string {
  if (!raw || raw === '0') {
    return '0';
  }
  const padded = raw.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, -decimals) || '0';
  const fracPart = padded.slice(-decimals).replace(/0+$/, '');
  if (!fracPart) {
    return intPart;
  }
  return `${intPart}.${fracPart}`;
}

export function formatCoinBalance(rawAmount: string, coin: CoinType): string {
  const config = COINS[coin];
  return formatBalance(rawAmount, config.decimals);
}

export function coinColor(coin: CoinType): string {
  const colorMap: Record<CoinType, string> = {
    [CoinType.BTC]: '#f7931a',
    [CoinType.ETH]: '#627eea',
    [CoinType.BCH]: '#0ac18e',
    [CoinType.FCH]: '#3b82f6',
    [CoinType.DOGE]: '#c2a633',
    [CoinType.USDT]: '#26a17b',
    [CoinType.USDC]: '#2775ca',
  };
  return colorMap[coin];
}
