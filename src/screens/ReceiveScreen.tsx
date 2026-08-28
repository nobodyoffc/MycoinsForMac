import {useState} from 'react';
import {Navigate, useParams} from 'react-router-dom';
import {QRCodeSVG} from 'qrcode.react';
import {useWalletStore} from '../store/wallet-store';
import {COINS} from '../coins/registry';
import {coinColor} from '../utils/format';
import {parseCoin} from '../utils/coin-param';

export function ReceiveScreen() {
  const {coin: coinParam} = useParams();
  const coin = parseCoin(coinParam);
  const balance = useWalletStore(s => (coin ? s.balances[coin] : null));
  const [copied, setCopied] = useState(false);

  if (!coin || !balance) {
    return <Navigate to="/dashboard" replace />;
  }

  const config = COINS[coin];
  const color = coinColor(coin);
  const address = balance.address;

  const handleCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div
        className="coin-hero"
        style={{background: color + '15', paddingTop: 'var(--space-lg)'}}>
        <div className="coin-hero-name" style={{fontWeight: 700}}>
          Receive {config.name}
        </div>
      </div>

      <div className="qr-container">
        {address ? (
          <div
            style={{
              background: '#fff',
              padding: 16,
              borderRadius: 12,
              border: '1px solid var(--color-border)',
            }}>
            <QRCodeSVG value={address} size={200} level="M" />
          </div>
        ) : (
          <div
            style={{
              width: 200,
              height: 200,
              background: 'var(--color-border)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-light)',
            }}>
            No address
          </div>
        )}
      </div>

      <div className="card" style={{marginBottom: 'var(--space-lg)'}}>
        <div
          style={{
            fontSize: 'var(--font-sm)',
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--space-sm)',
          }}>
          {config.ticker} Address
        </div>
        <div
          className="mono"
          style={{
            fontSize: 'var(--font-sm)',
            userSelect: 'all',
            wordBreak: 'break-all',
          }}>
          {address}
        </div>
      </div>

      <button
        className="btn"
        style={{background: color, width: '100%', padding: '10px 16px'}}
        onClick={handleCopy}>
        {copied ? 'Copied ✓' : 'Copy Address'}
      </button>
    </div>
  );
}
