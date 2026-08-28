import {useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {Avatar} from './Avatar';
import {useAccountStore} from '../store/account-store';
import {bytesToHex, encodeWIF} from '../crypto/encoding';
import {encryptToHex} from '../crypto/aes';

interface Props {
  keyId: string;
  onClose: () => void;
}

// Seeing or exporting the prikey is not the same as having stored it safely,
// so the flag only flips on an explicit confirmation. The confirm button stays
// disabled until the user has actually revealed or copied the key, so it can't
// be clicked past without the material ever being shown.
export function BackupPrikeyDialog({keyId, onClose}: Props) {
  const keys = useAccountStore(s => s.keys);
  const currentAccount = useAccountStore(s => s.currentAccount);
  const markKeyBackedUp = useAccountStore(s => s.markKeyBackedUp);

  const [format, setFormat] = useState<'hex' | 'wif'>('hex');
  const [revealed, setRevealed] = useState(false);
  const [cipherCopied, setCipherCopied] = useState(false);
  const [exposed, setExposed] = useState(false);

  const entry = keys.find(k => k.id === keyId);
  const privateKey = entry && !entry.isWatchOnly ? entry.privateKey : null;

  const prikeyText = (): string => {
    if (!privateKey) return '';
    return format === 'hex' ? bytesToHex(privateKey) : encodeWIF(privateKey);
  };

  const handleReveal = () => {
    const next = !revealed;
    setRevealed(next);
    if (next) setExposed(true);
  };

  const handleCopyCipher = async () => {
    if (!privateKey || !currentAccount) return;
    const encrypted = encryptToHex(privateKey, currentAccount.symkey);
    const cipherBytes = new Uint8Array(
      encrypted.ciphertext.match(/.{2}/g)!.map(b => parseInt(b, 16)),
    );
    let binary = '';
    for (let i = 0; i < cipherBytes.length; i++) {
      binary += String.fromCharCode(cipherBytes[i]);
    }
    const cipherJson = JSON.stringify({
      type: 'Password',
      alg: 'AesGcm256@No1_NrC7',
      cipher: btoa(binary),
      keyName: currentAccount.id,
      iv: encrypted.iv,
    });
    await navigator.clipboard.writeText(cipherJson);
    setCipherCopied(true);
    setTimeout(() => setCipherCopied(false), 2000);
    setExposed(true);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="backup-dialog-head">
          <Avatar address={keyId} size={44} />
          <div>
            <h2 style={{margin: 0, fontSize: 'var(--font-lg)'}}>Backup Prikey</h2>
            <span
              className={`backup-badge${entry?.backedUp ? ' done' : ' pending'}`}>
              {entry?.backedUp ? 'Backed Up' : 'Not Backed Up'}
            </span>
          </div>
        </div>

        <div className="backup-key-id">{keyId}</div>

        {!privateKey ? (
          <div className="empty-state" style={{padding: 'var(--space-md) 0'}}>
            This key is watch-only — there is no prikey to back up.
          </div>
        ) : (
          <>
            <div className="format-toggle">
              <button
                className={`pill${format === 'hex' ? ' active' : ''}`}
                onClick={() => setFormat('hex')}>
                Hex
              </button>
              <button
                className={`pill${format === 'wif' ? ' active' : ''}`}
                onClick={() => setFormat('wif')}>
                WIF
              </button>
            </div>

            <button className="reveal-btn" onClick={handleReveal}>
              {revealed ? 'Hide Prikey' : 'Reveal Prikey'}
            </button>

            {revealed && (
              <div className="privkey-reveal">
                <QRCodeSVG value={prikeyText()} size={200} level="M" />
                <div className="privkey-text">{prikeyText()}</div>
              </div>
            )}

            <button
              className="btn"
              style={{width: '100%', padding: '8px 16px'}}
              onClick={handleCopyCipher}>
              {cipherCopied ? 'Copied ✓' : 'Copy Cipher'}
            </button>
            <p
              style={{
                fontSize: 'var(--font-xs)',
                color: 'var(--color-text-light)',
                marginTop: 'var(--space-xs)',
                textAlign: 'center',
                lineHeight: 1.4,
              }}>
              Copies the password-encrypted prikey as JSON. Safe to store —
              requires your password to decrypt.
            </p>

            {!entry?.backedUp && (
              <div className="confirm-backup">
                <div className="hint-text" style={{marginBottom: 'var(--space-sm)'}}>
                  {exposed
                    ? 'Store it somewhere only you can reach, then confirm.'
                    : 'Reveal or copy the prikey first.'}
                </div>
                <button
                  className="btn"
                  style={{width: '100%', padding: '8px 16px'}}
                  disabled={!exposed}
                  onClick={() => void markKeyBackedUp(keyId)}>
                  I've Saved It
                </button>
              </div>
            )}
          </>
        )}

        <button
          className="btn-ghost"
          style={{width: '100%', marginTop: 'var(--space-md)'}}
          onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
