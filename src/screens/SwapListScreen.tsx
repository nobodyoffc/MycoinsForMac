import {useCallback, useEffect, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {getFCHLegacyApi} from '../api/api-registry';
import {Avatar} from '../components/Avatar';
import {formatAddress} from '../utils/format';

interface SwapParams {
  goods: string;
  money: string;
  gTick: string;
  mTick: string;
  gAddr: string;
  mAddr: string;
  swapFee: string;
  serviceFee: string;
  gConfirm: string;
  mConfirm: string;
  curve: string;
}

export interface SwapService {
  id: string;
  stdName: string;
  desc: string;
  type: string;
  owner: string;
  dealer: string;
  active: boolean;
  tRate: number;
  tCdd: number;
  birthTime: number;
  params: SwapParams;
}

function totalFee(s: SwapService): string {
  const swap = parseFloat(s.params.swapFee || '0');
  const service = parseFloat(s.params.serviceFee || '0');
  return ((swap + service) * 100).toFixed(1) + '%';
}

export function SwapListScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tick = searchParams.get('tick') ?? undefined;
  const [services, setServices] = useState<SwapService[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const api = getFCHLegacyApi();
      const data = await api.searchSwapServices(tick);
      const parsed: SwapService[] = data
        .map((s: any) => {
          const params =
            typeof s.params === 'string' ? JSON.parse(s.params) : s.params;
          return {
            id: s.id,
            stdName: s.stdName || '',
            desc: s.desc || '',
            type: s.type || '',
            owner: s.owner || '',
            dealer: s.dealer || '',
            active: s.active !== false,
            tRate: s.tRate || 0,
            tCdd: s.tCdd || 0,
            birthTime: s.birthTime || 0,
            params,
          };
        })
        .filter(
          (s: SwapService) =>
            s.params?.gTick && s.params?.mTick && s.params?.gAddr && s.params?.mAddr,
        );
      setServices(parsed);
    } catch (err) {
      console.warn('[SwapList] Failed to fetch:', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tick]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-md)',
        }}>
        <div>
          <h1 className="page-title" style={{margin: 0}}>Swap</h1>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-sm)',
              margin: '4px 0 0 0',
            }}>
            Decentralized coin exchange
          </p>
        </div>
        <button
          className="btn-secondary"
          style={{borderRadius: 6, padding: '6px 12px'}}
          onClick={fetchServices}
          disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && services.length === 0 ? (
        <div className="empty-state">Loading swap services…</div>
      ) : services.length === 0 ? (
        <div className="empty-state">No swap services available</div>
      ) : (
        services.map(item => (
          <div
            key={item.id}
            className="swap-card"
            onClick={() =>
              navigate(`/swaps/${item.id}`, {state: {service: item}})
            }>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-xs)',
              }}>
              <div className="swap-pair">
                <span>{item.params.gTick.toUpperCase()}</span>
                <span className="arrow">⇄</span>
                <span>{item.params.mTick.toUpperCase()}</span>
              </div>
              <span className="swap-fee">Fee: {totalFee(item)}</span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-sm)',
              }}>
              {item.stdName ? (
                <span style={{fontWeight: 600, fontSize: 'var(--font-sm)'}}>
                  {item.stdName}
                </span>
              ) : (
                <span />
              )}
              <span
                className="mono"
                style={{
                  fontSize: 'var(--font-xs)',
                  color: 'var(--color-text-light)',
                }}>
                {formatAddress(item.id, 6, 4)}
              </span>
            </div>

            <div className="swap-avatar-row">
              <div className="swap-avatar-item">
                <Avatar address={item.dealer} size={36} />
                <div>
                  <div
                    style={{
                      fontSize: 'var(--font-xs)',
                      color: 'var(--color-text-light)',
                    }}>
                    Dealer
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 'var(--font-xs)',
                      color: 'var(--color-text-secondary)',
                    }}>
                    {formatAddress(item.dealer, 6, 4)}
                  </div>
                </div>
              </div>
              <div className="swap-avatar-item">
                <Avatar address={item.owner} size={24} />
                <div>
                  <div
                    style={{
                      fontSize: 'var(--font-xs)',
                      color: 'var(--color-text-light)',
                    }}>
                    Owner
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 'var(--font-xs)',
                      color: 'var(--color-text-secondary)',
                    }}>
                    {formatAddress(item.owner, 6, 4)}
                  </div>
                </div>
              </div>
            </div>

            <div className="swap-stats-row">
              <span>Rating: {item.tRate ?? '-'}</span>
              <span>CDD: {item.tCdd || 0}</span>
              <span>
                Since:{' '}
                {item.birthTime > 0
                  ? new Date(item.birthTime * 1000).toLocaleDateString()
                  : '-'}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
