import {useEffect} from 'react';
import {useNavigate, useParams, Navigate} from 'react-router-dom';
import {useAccountStore} from '../store/account-store';
import {useWalletStore} from '../store/wallet-store';
import {COINS} from '../coins/registry';
import {formatCoinBalance, coinColor} from '../utils/format';
import {parseCoin} from '../utils/coin-param';

export function CoinDetailScreen() {
  const navigate = useNavigate();
  const {coin: coinParam} = useParams();
  const coin = parseCoin(coinParam);

  const activeKey = useAccountStore(s => s.keys.find(k => k.id === s.activeKeyId));
  const balance = useWalletStore(s => (coin ? s.balances[coin] : null));
  const fetchTransactions = useWalletStore(s => s.fetchTransactions);
  const getDisplayBalance = useWalletStore(s => s.getDisplayBalance);
  const getMergedTransactions = useWalletStore(s => s.getMergedTransactions);

  useEffect(() => {
    if (coin) fetchTransactions(coin);
  }, [coin, fetchTransactions]);

  if (!coin || !balance) {
    return <Navigate to="/dashboard" replace />;
  }

  const config = COINS[coin];
  const color = coinColor(coin);
  const displayRaw = getDisplayBalance(coin);
  const txs = getMergedTransactions(coin);

  return (
    <div>
      <div className="coin-hero" style={{background: color + '15'}}>
        <div
          className="coin-hero-icon"
          style={{background: color + '30', color}}>
          {config.ticker}
        </div>
        <div className="coin-hero-name">{config.name}</div>
        <div className="coin-hero-balance">
          {formatCoinBalance(displayRaw, coin)} {config.ticker}
        </div>
        <div className="coin-hero-address">{balance.address}</div>
      </div>

      <div className="coin-actions">
        <button
          className="btn-secondary"
          style={{borderColor: color, color}}
          onClick={() => navigate(`/swaps?tick=${config.ticker}`)}>
          Swap
        </button>
        <button
          className="btn"
          style={{background: color}}
          disabled={activeKey?.isWatchOnly}
          onClick={() => navigate(`/coins/${coin}/send`)}>
          Send
        </button>
        <button
          className="btn-secondary"
          style={{borderColor: color, color}}
          onClick={() => navigate(`/coins/${coin}/receive`)}>
          Receive
        </button>
      </div>

      <div className="section-title">Transactions</div>

      {txs.length === 0 ? (
        <div className="empty-state">No transactions yet</div>
      ) : (
        <div className="tx-list">
          {txs.map(tx => {
            const isPending =
              tx.confirmations === 0 && tx.direction === 'out';
            return (
              <div
                key={tx.txid}
                className={`tx-item${isPending ? ' pending' : ''}`}
                onClick={() => navigate(`/coins/${coin}/tx/${tx.txid}`)}>
                <div className="tx-info">
                  <div className="tx-direction">
                    <span>{tx.direction === 'in' ? 'Received' : 'Sent'}</span>
                    {isPending && (
                      <span className="tx-pending-badge">Pending</span>
                    )}
                  </div>
                  <div className="tx-id">{tx.txid}</div>
                  {tx.timestamp > 0 && (
                    <div className="tx-time">
                      {new Date(tx.timestamp * 1000).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className={`tx-amount ${tx.direction}`}>
                  {tx.direction === 'in' ? '+' : '-'}
                  {formatCoinBalance(tx.amount, coin)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
