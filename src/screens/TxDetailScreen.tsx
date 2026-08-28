import {useState} from 'react';
import {Navigate, useParams} from 'react-router-dom';
import {useWalletStore} from '../store/wallet-store';
import {COINS} from '../coins/registry';
import {formatCoinBalance, coinColor} from '../utils/format';
import {parseCoin} from '../utils/coin-param';

function DetailRow({
  label,
  value,
  mono,
  onClick,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="detail-row">
      <div className="label">{label}</div>
      <div
        className={`value${mono ? ' mono' : ''}${onClick ? ' copy-target' : ''}`}
        onClick={onClick}>
        {value}
      </div>
    </div>
  );
}

export function TxDetailScreen() {
  const {coin: coinParam, txid} = useParams();
  const coin = parseCoin(coinParam);
  const getMergedTransactions = useWalletStore(s => s.getMergedTransactions);
  const [copied, setCopied] = useState(false);

  if (!coin || !txid) {
    return <Navigate to="/dashboard" replace />;
  }

  const tx = getMergedTransactions(coin).find(t => t.txid === txid);
  if (!tx) {
    return <Navigate to={`/coins/${coin}`} replace />;
  }

  const config = COINS[coin];
  const color = coinColor(coin);

  const handleCopyTxid = async () => {
    await navigator.clipboard.writeText(tx.txid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div
        className="coin-hero"
        style={{background: color + '15', paddingBlock: 'var(--space-xl)'}}>
        <div
          style={{
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--space-sm)',
          }}>
          {tx.direction === 'in' ? 'Received' : 'Sent'}
        </div>
        <div
          style={{
            fontSize: 'var(--font-xxl)',
            fontWeight: 700,
            color:
              tx.direction === 'in'
                ? 'var(--color-success)'
                : 'var(--color-error)',
          }}>
          {tx.direction === 'in' ? '+' : '-'}
          {formatCoinBalance(tx.amount, coin)} {config.ticker}
        </div>
      </div>

      <DetailRow
        label={copied ? 'Transaction ID (copied ✓)' : 'Transaction ID'}
        value={tx.txid}
        mono
        onClick={handleCopyTxid}
      />
      {tx.from && <DetailRow label="From" value={tx.from} mono />}
      {tx.to && <DetailRow label="To" value={tx.to} mono />}
      {tx.fee && tx.fee !== '0' && (
        <DetailRow
          label="Fee"
          value={`${formatCoinBalance(tx.fee, coin)} ${config.ticker}`}
        />
      )}
      {tx.confirmations > 0 && (
        <DetailRow
          label="Confirmations"
          value={String(tx.confirmations)}
        />
      )}
      {tx.timestamp > 0 && (
        <DetailRow
          label="Time"
          value={new Date(tx.timestamp * 1000).toLocaleString()}
        />
      )}
      <DetailRow label="Coin" value={`${config.name} (${config.ticker})`} />
      <DetailRow
        label="Direction"
        value={tx.direction === 'in' ? 'Incoming' : 'Outgoing'}
      />
    </div>
  );
}
