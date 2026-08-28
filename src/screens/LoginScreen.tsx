import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAccountStore} from '../store/account-store';

export function LoginScreen() {
  const navigate = useNavigate();
  const login = useAccountStore(s => s.login);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const success = await login(password);
      if (!success) {
        const ok = window.confirm(
          'No account found for this password. Create a new one?',
        );
        if (ok) {
          navigate('/create-account', {state: {password}});
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="auth-card">
      <h1>MyCoins</h1>
      <p className="subtitle">Multi-Coin Wallet</p>

      <label htmlFor="pw">Password</label>
      <input
        id="pw"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Enter your password"
        autoFocus
      />

      {error && <div className="error">{error}</div>}

      <button
        className="btn"
        onClick={handleLogin}
        disabled={loading}>
        {loading ? 'Unlocking…' : 'Login'}
      </button>

      <button
        className="btn-ghost"
        onClick={() => navigate('/create-account')}>
        Create New Account
      </button>
    </div>
  );
}
