import {useEffect, useState} from 'react';
import {
  setOnApiBalanceOut,
  ApiBalanceOutEvent,
} from '../api/providers/common-api';
import {getFCHCommonApi} from '../api/api-registry';
import {buildFchTransaction} from '../coins/fch/tx-builder';
import {useAccountStore} from '../store/account-store';
import {TxInput} from '../coins/utxo-common';
import {COINS} from '../coins/registry';
import {CoinType} from '../coins/types';

export function ApiPaymentHandler() {
  const [event, setEvent] = useState<ApiBalanceOutEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const keys = useAccountStore(s => s.keys);
  const activeKeyId = useAccountStore(s => s.activeKeyId);

  useEffect(() => {
    setOnApiBalanceOut(ev => setEvent(ev));
    return () => setOnApiBalanceOut(null);
  }, []);

  if (!event) return null;

  const activeKey = keys.find(k => k.id === activeKeyId);
  const hasUtxos = !!event.utxos && event.utxos.length > 0;
  const canAutoPay = hasUtxos && !!activeKey?.privateKey;

  const handleAutoPay = async () => {
    if (!activeKey?.privateKey || !event.utxos) return;
    setLoading(true);
    try {
      const config = COINS[CoinType.FCH];
      const parts = event.minPayment.split('.');
      const intPart = parts[0] || '0';
      let fracPart = parts[1] || '';
      fracPart = fracPart.padEnd(config.decimals, '0').slice(0, config.decimals);
      const amountSats = parseInt(intPart + fracPart, 10);

      const txInputs: TxInput[] = event.utxos.map(u => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        scriptPubKey: u.scriptPubKey,
      }));

      const result = buildFchTransaction({
        utxos: txInputs,
        recipients: [{address: event.dealer, value: amountSats}],
        changeAddress: activeKey.id,
        feeRate: 1,
        privateKey: activeKey.privateKey,
      });

      const commonApi = getFCHCommonApi();
      const resp = await fetch(
        `${commonApi.getBaseUrl()}/mycoins/v1/broadcastTx?rawTx=${result.rawHex}`,
      );
      const json = await resp.json();

      if (json.code === 0) {
        window.alert(
          `API Payment Sent\n\nPaid ${event.minPayment} FCH to ${event.dealer}\nTXID: ${json.data || result.txid}`,
        );
      } else {
        window.alert(`Payment Failed: ${json.message || 'Unknown error'}`);
      }
    } catch (err) {
      window.alert(`Payment Failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      setEvent(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setEvent(null)}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <h2 style={{color: 'var(--color-error)'}}>API Balance Exhausted</h2>
        <p style={{lineHeight: 1.5}}>
          The FCH API service requires payment to continue. Send at least{' '}
          <b>{event.minPayment} FCH</b> to the service dealer:
        </p>

        <div
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 'var(--space-md)',
            marginBottom: 'var(--space-sm)',
          }}>
          <div
            style={{
              fontSize: 'var(--font-xs)',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-xs)',
            }}>
            Dealer Address
          </div>
          <div
            className="mono"
            style={{fontSize: 'var(--font-sm)', wordBreak: 'break-all'}}>
            {event.dealer}
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 'var(--space-md)',
            marginBottom: 'var(--space-md)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
          <span style={{color: 'var(--color-text-secondary)'}}>
            Minimum Payment
          </span>
          <span
            style={{
              fontSize: 'var(--font-lg)',
              fontWeight: 700,
              color: 'var(--color-primary)',
            }}>
            {event.minPayment} FCH
          </span>
        </div>

        {canAutoPay ? (
          <>
            <p
              style={{
                color: 'var(--color-success)',
                fontSize: 'var(--font-sm)',
                marginBottom: 'var(--space-md)',
              }}>
              UTXOs are available. Click below to pay automatically.
            </p>
            <button
              className="btn"
              style={{width: '100%', marginBottom: 'var(--space-sm)'}}
              onClick={handleAutoPay}
              disabled={loading}>
              {loading ? 'Paying…' : `Pay ${event.minPayment} FCH Now`}
            </button>
          </>
        ) : (
          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-sm)',
              marginBottom: 'var(--space-md)',
              lineHeight: 1.5,
            }}>
            Send at least <b>{event.minPayment} FCH</b> to{' '}
            <span
              className="mono"
              style={{fontSize: 'var(--font-xs)', fontWeight: 700}}>
              {event.dealer}
            </span>{' '}
            using the Send function on the FCH coin page, then try again.
          </p>
        )}

        <button
          className="btn-ghost"
          style={{width: '100%'}}
          onClick={() => setEvent(null)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
