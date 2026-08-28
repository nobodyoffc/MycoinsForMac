import {create} from 'zustand';
import {CoinType, Transaction} from '../coins/types';
import {fetchAllBalances, getProvider} from '../api/api-registry';
import {formatCoinBalance} from '../utils/format';

interface CoinBalance {
  coin: CoinType;
  balance: string;
  balanceRaw: string;
  address: string;
}

interface PendingTx {
  txid: string;
  coin: CoinType;
  fromAddress: string;
  toAddress: string;
  amount: string; // raw amount in smallest unit
  fee: string;
  timestamp: number;
}

const PENDING_TX_EXPIRY = 60 * 60 * 1000; // 1 hour

interface WalletState {
  balances: Record<CoinType, CoinBalance>;
  transactions: Record<CoinType, Transaction[]>;
  pendingTxs: PendingTx[];
  isLoading: boolean;
  lastRefresh: number | null;

  // Actions
  setBalance: (coin: CoinType, balance: string, balanceRaw: string, address: string) => void;
  setBalances: (balances: Record<CoinType, CoinBalance>) => void;
  setTransactions: (coin: CoinType, txs: Transaction[]) => void;
  setLoading: (loading: boolean) => void;
  clearWallet: () => void;
  initializeForKey: (addresses: Record<CoinType, string>) => void;
  refreshBalances: () => Promise<void>;
  fetchTransactions: (coin: CoinType) => Promise<void>;
  addPendingTx: (tx: PendingTx) => void;
  getDisplayBalance: (coin: CoinType) => string;
  getMergedTransactions: (coin: CoinType) => Transaction[];
}

const emptyBalance = (coin: CoinType, address: string = ''): CoinBalance => ({
  coin,
  balance: '0',
  balanceRaw: '0',
  address,
});

const initialBalances: Record<CoinType, CoinBalance> = {
  [CoinType.BTC]: emptyBalance(CoinType.BTC),
  [CoinType.BCH]: emptyBalance(CoinType.BCH),
  [CoinType.FCH]: emptyBalance(CoinType.FCH),
  [CoinType.DOGE]: emptyBalance(CoinType.DOGE),
  [CoinType.ETH]: emptyBalance(CoinType.ETH),
  [CoinType.USDT]: emptyBalance(CoinType.USDT),
  [CoinType.USDC]: emptyBalance(CoinType.USDC),
};

const initialTransactions: Record<CoinType, Transaction[]> = {
  [CoinType.BTC]: [],
  [CoinType.BCH]: [],
  [CoinType.FCH]: [],
  [CoinType.DOGE]: [],
  [CoinType.ETH]: [],
  [CoinType.USDT]: [],
  [CoinType.USDC]: [],
};

export const useWalletStore = create<WalletState>((set, get) => ({
  balances: {...initialBalances},
  transactions: {...initialTransactions},
  pendingTxs: [],
  isLoading: false,
  lastRefresh: null,

  setBalance: (coin, balance, balanceRaw, address) => {
    set(state => ({
      balances: {
        ...state.balances,
        [coin]: {coin, balance, balanceRaw, address},
      },
    }));
  },

  setBalances: (balances) => {
    set({balances, lastRefresh: Date.now()});
  },

  setTransactions: (coin, txs) => {
    set(state => ({
      transactions: {
        ...state.transactions,
        [coin]: txs,
      },
    }));
  },

  setLoading: (loading) => {
    set({isLoading: loading});
  },

  clearWallet: () => {
    set({
      balances: {...initialBalances},
      transactions: {...initialTransactions},
      pendingTxs: [],
      isLoading: false,
      lastRefresh: null,
    });
  },

  initializeForKey: (addresses) => {
    const balances: Record<CoinType, CoinBalance> = {} as any;
    for (const coin of Object.values(CoinType)) {
      balances[coin] = emptyBalance(coin, addresses[coin] || '');
    }
    set({
      balances,
      transactions: {...initialTransactions},
      pendingTxs: [],
      lastRefresh: null,
    });
  },

  refreshBalances: async () => {
    const {balances} = get();
    const addresses: Record<CoinType, string> = {} as any;
    for (const coin of Object.values(CoinType)) {
      addresses[coin] = balances[coin].address;
    }

    set({isLoading: true});
    try {
      const rawBalances = await fetchAllBalances(addresses);
      const updated: Record<CoinType, CoinBalance> = {} as any;
      for (const coin of Object.values(CoinType)) {
        updated[coin] = {
          coin,
          balanceRaw: rawBalances[coin] || '0',
          balance: formatCoinBalance(rawBalances[coin] || '0', coin),
          address: addresses[coin],
        };
      }
      set({balances: updated, lastRefresh: Date.now()});

      // Clean up pending TXs: remove confirmed and expired ones
      const {pendingTxs, transactions} = get();
      const now = Date.now();
      const remaining = pendingTxs.filter(ptx => {
        // Remove if expired
        if (now - ptx.timestamp > PENDING_TX_EXPIRY) return false;
        // Remove if confirmed (txid appears in API history)
        const confirmedTxs = transactions[ptx.coin] || [];
        if (confirmedTxs.some(t => t.txid === ptx.txid)) return false;
        return true;
      });
      if (remaining.length !== pendingTxs.length) {
        set({pendingTxs: remaining});
      }
    } finally {
      set({isLoading: false});
    }
  },

  fetchTransactions: async (coin: CoinType) => {
    const {balances} = get();
    const address = balances[coin]?.address;
    if (!address) return;

    try {
      const provider = getProvider(coin);
      const txs = await provider.getTransactionHistory(address);
      set(state => ({
        transactions: {...state.transactions, [coin]: txs},
      }));

      // Clean up pending TXs that are now confirmed
      const {pendingTxs} = get();
      const confirmedIds = new Set(txs.map(t => t.txid));
      const remaining = pendingTxs.filter(
        ptx => ptx.coin !== coin || !confirmedIds.has(ptx.txid),
      );
      if (remaining.length !== pendingTxs.length) {
        set({pendingTxs: remaining});
      }
    } catch {
      // Keep existing txs
    }
  },

  addPendingTx: (tx: PendingTx) => {
    set(state => ({
      pendingTxs: [tx, ...state.pendingTxs],
    }));
  },

  // Display balance = API balance - pending outgoing amounts
  getDisplayBalance: (coin: CoinType): string => {
    const {balances, pendingTxs} = get();
    const apiBalance = BigInt(balances[coin]?.balanceRaw || '0');
    const pendingOut = pendingTxs
      .filter(ptx => ptx.coin === coin)
      .reduce((sum, ptx) => sum + BigInt(ptx.amount) + BigInt(ptx.fee || '0'), 0n);
    const display = apiBalance - pendingOut;
    return (display > 0n ? display : 0n).toString();
  },

  // Merge confirmed TXs + pending TXs, no duplicates
  getMergedTransactions: (coin: CoinType): Transaction[] => {
    const {transactions, pendingTxs} = get();
    const confirmed = transactions[coin] || [];
    const confirmedIds = new Set(confirmed.map(t => t.txid));

    // Convert pending TXs to Transaction format, skip already confirmed ones
    const pendingAsTxs: Transaction[] = pendingTxs
      .filter(ptx => ptx.coin === coin && !confirmedIds.has(ptx.txid))
      .map(ptx => ({
        txid: ptx.txid,
        coin: ptx.coin,
        from: ptx.fromAddress,
        to: ptx.toAddress,
        amount: ptx.amount,
        fee: ptx.fee,
        timestamp: Math.floor(ptx.timestamp / 1000),
        confirmations: 0, // 0 = pending
        direction: 'out' as const,
      }));

    return [...pendingAsTxs, ...confirmed];
  },
}));
