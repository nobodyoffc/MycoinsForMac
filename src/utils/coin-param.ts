import {CoinType} from '../coins/types';

const COIN_VALUES = Object.values(CoinType) as string[];

export function parseCoin(param: string | undefined): CoinType | null {
  if (!param || !COIN_VALUES.includes(param)) return null;
  return param as CoinType;
}
