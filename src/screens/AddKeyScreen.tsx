import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAccountStore} from '../store/account-store';

type ImportMode = 'random' | 'hex' | 'wif' | 'secret' | 'pubkey' | 'cipher';

const MODES: {key: ImportMode; label: string; desc: string}[] = [
  {key: 'random', label: 'Random', desc: 'Generate a random private key'},
  {key: 'hex', label: 'Hex', desc: 'Import a hex private key (64 chars)'},
  {key: 'wif', label: 'WIF', desc: 'Import a WIF (Base58Check) private key'},
  {key: 'secret', label: 'Secret', desc: 'Derive key from sha256(secret string)'},
  {key: 'pubkey', label: 'Watch Only', desc: 'Import a public key (watch only)'},
  {key: 'cipher', label: 'Key Cipher', desc: 'Import from password-encrypted cipher JSON'},
];

function inputLabel(mode: ImportMode): string {
  switch (mode) {
    case 'hex': return 'Private Key (Hex)';
    case 'wif': return 'Private Key (WIF)';
    case 'secret': return 'Secret String';
    case 'cipher': return 'Cipher JSON';
    case 'pubkey': return 'Public Key (Hex)';
    default: return '';
  }
}

function inputPlaceholder(mode: ImportMode): string {
  switch (mode) {
    case 'hex': return '64-character hex string';
    case 'wif': return 'Starts with 5, K, or L';
    case 'secret': return 'Any text — sha256 of this will be your key';
    case 'cipher': return 'Paste the cipher JSON from backup';
    case 'pubkey': return '33 or 65 byte compressed/uncompressed pubkey hex';
    default: return '';
  }
}

export function AddKeyScreen() {
  const navigate = useNavigate();
  const addRandomKey = useAccountStore(s => s.addRandomKey);
  const importKeyHex = useAccountStore(s => s.importKeyHex);
  const importKeyWIF = useAccountStore(s => s.importKeyWIF);
  const importKeyFromSecret = useAccountStore(s => s.importKeyFromSecret);
  const importPublicKey = useAccountStore(s => s.importPublicKey);
  const importKeyCipher = useAccountStore(s => s.importKeyCipher);

  const [mode, setMode] = useState<ImportMode>('random');
  const [inputValue, setInputValue] = useState('');
  const [cipherPassword, setCipherPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    setError('');
    setLoading(true);
    try {
      let entry;
      switch (mode) {
        case 'random':
          entry = await addRandomKey();
          break;
        case 'hex':
          if (!inputValue.trim()) throw new Error('Please enter a hex private key');
          entry = await importKeyHex(inputValue.trim());
          break;
        case 'wif':
          if (!inputValue.trim()) throw new Error('Please enter a WIF private key');
          entry = await importKeyWIF(inputValue.trim());
          break;
        case 'secret':
          if (!inputValue.trim()) throw new Error('Please enter a secret string');
          entry = await importKeyFromSecret(inputValue.trim());
          break;
        case 'pubkey':
          if (!inputValue.trim()) throw new Error('Please enter a public key hex');
          entry = await importPublicKey(inputValue.trim());
          break;
        case 'cipher':
          if (!inputValue.trim()) throw new Error('Please enter the cipher JSON');
          if (!cipherPassword) throw new Error('Please enter the cipher password');
          entry = await importKeyCipher(inputValue.trim(), cipherPassword);
          break;
      }
      window.alert(`Key added: ${entry!.id}`);
      navigate('/keys');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const activeMode = MODES.find(m => m.key === mode);
  const isSecret = mode === 'secret';
  const needsInput = mode !== 'random';

  return (
    <div>
      <h1 className="page-title">Add Key</h1>

      <div className="section-title" style={{marginTop: 0}}>Source</div>
      <div className="pill-row">
        {MODES.map(m => (
          <button
            key={m.key}
            className={`pill${mode === m.key ? ' active' : ''}`}
            onClick={() => {
              setMode(m.key);
              setInputValue('');
              setCipherPassword('');
              setError('');
            }}>
            {m.label}
          </button>
        ))}
      </div>
      <p
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-sm)',
          marginBottom: 'var(--space-lg)',
        }}>
        {activeMode?.desc}
      </p>

      {needsInput && (
        <>
          <div className="form-group">
            <label>{inputLabel(mode)}</label>
            {isSecret ? (
              <input
                type="password"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={inputPlaceholder(mode)}
              />
            ) : (
              <textarea
                className="mono"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={inputPlaceholder(mode)}
                rows={mode === 'cipher' ? 6 : 3}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            )}
          </div>

          {mode === 'cipher' && (
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={cipherPassword}
                onChange={e => setCipherPassword(e.target.value)}
                placeholder="Password used to encrypt this key"
              />
            </div>
          )}
        </>
      )}

      {error && (
        <div style={{color: 'var(--color-error)', marginBottom: 'var(--space-md)'}}>
          {error}
        </div>
      )}

      <button
        className="btn"
        style={{width: '100%', padding: '10px 16px'}}
        onClick={handleAdd}
        disabled={loading}>
        {loading
          ? 'Working…'
          : mode === 'random'
          ? 'Generate Key'
          : 'Import Key'}
      </button>
    </div>
  );
}
