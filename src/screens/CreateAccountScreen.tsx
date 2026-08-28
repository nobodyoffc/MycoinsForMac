import {useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {deriveAccountId} from '../account/account';
import {useAccountStore} from '../store/account-store';

export function CreateAccountScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const createNewAccount = useAccountStore(s => s.createNewAccount);

  const seedPassword = (location.state as {password?: string} | null)?.password ?? '';
  const [password, setPassword] = useState(seedPassword);
  const [confirmPassword, setConfirmPassword] = useState(seedPassword);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const accountId = password ? deriveAccountId(password) : '';

  const handleCreate = async () => {
    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await createNewAccount(password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h1 style={{color: 'var(--color-text)', fontSize: 'var(--font-xxl)'}}>
        Create Account
      </h1>
      <p className="subtitle">
        Your password encrypts your private keys. A random key will be
        generated automatically.
      </p>

      <label htmlFor="pw">Password</label>
      <input
        id="pw"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Enter a strong password"
        autoFocus
      />

      <label htmlFor="pw2">Confirm Password</label>
      <input
        id="pw2"
        type="password"
        value={confirmPassword}
        onChange={e => setConfirmPassword(e.target.value)}
        placeholder="Confirm your password"
      />

      {accountId && (
        <div className="preview-box">
          <div className="preview-label">Account ID</div>
          <div className="preview-value">{accountId}</div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <button
        className="btn"
        onClick={handleCreate}
        disabled={loading}>
        {loading ? 'Creating…' : 'Create Account'}
      </button>

      <button className="btn-ghost" onClick={() => navigate('/login')}>
        Back to Login
      </button>
    </div>
  );
}
