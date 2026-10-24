import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, useAuth } from '../AuthContext';
import { appHostFromApiUrl, LoginChoice } from '../services/onePasswordItems';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [onePasswordAvailable, setOnePasswordAvailable] = useState(false);
  const [waitingForOnePassword, setWaitingForOnePassword] = useState(false);
  const [onePasswordChoices, setOnePasswordChoices] = useState<LoginChoice[]>([]);
  const { api, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    window.electron.onePassword.isAvailable().then((available) => {
      if (!cancelled) setOnePasswordAvailable(available);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const submitLogin = async (loginUsername: string, loginPassword: string) => {
    setError('');
    setLoading(true);

    try {
      const response = await api.login({ username: loginUsername, password: loginPassword });
      login(response.accessToken, response.refreshToken, response.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitLogin(username, password);
  };

  const fillWithOnePassword = async (itemId?: string) => {
    setError('');
    setOnePasswordChoices([]);
    setWaitingForOnePassword(true);
    try {
      const result = await window.electron.onePassword.fill(appHostFromApiUrl(API_URL), itemId);
      if (result.status === 'filled') {
        setUsername(result.credentials.username);
        setPassword(result.credentials.password);
        await submitLogin(result.credentials.username, result.credentials.password);
      } else if (result.status === 'choose') {
        setOnePasswordChoices(result.choices);
      } else if (result.status === 'not-found') {
        setError('No Flashpad login found in 1Password.');
      } else {
        setError(`1Password: ${result.message}`);
      }
    } finally {
      setWaitingForOnePassword(false);
    }
  };

  const busy = loading || waitingForOnePassword;

  return (
    <div className="form-container">
      <h2 className="text-center">Login</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="username">Username or email</label>
          <div className={onePasswordAvailable ? 'input-with-action' : undefined}>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoFocus
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            {onePasswordAvailable && (
              <button
                type="button"
                className="input-action"
                title="Fill with 1Password"
                aria-label="Fill with 1Password"
                disabled={busy}
                onClick={() => void fillWithOnePassword()}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 12h9m-3 0v3m-3-3v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {onePasswordChoices.length > 0 && (
          <div className="one-password-choices">
            {onePasswordChoices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                disabled={busy}
                onClick={() => void fillWithOnePassword(choice.id)}
              >
                {choice.username ? `${choice.title} (${choice.username})` : choice.title}
              </button>
            ))}
          </div>
        )}
        {waitingForOnePassword && <div className="text-center">Waiting for 1Password…</div>}
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy} className="btn-primary">
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <p className="text-center mt-2">
        Don't have an account?{' '}
        <span className="link" onClick={() => navigate('/register')}>
          Register
        </span>
      </p>
    </div>
  );
}

export default Login;
