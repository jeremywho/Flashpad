import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

function Account() {
  const { user, api, logout } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setFullName(user.fullName || '');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await api.updateCurrentUser({
        email: email !== user?.email ? email : undefined,
        fullName: fullName !== user?.fullName ? fullName : undefined,
        password: password || undefined,
      });
      setSuccess('Account updated successfully!');
      setPassword('');

      // Refresh user data (would require updating AuthContext to refresh the user state)
      await api.getCurrentUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <nav className="nav">
        <h2>Flashpad</h2>
        <div className="nav-links">
          <span className="link" onClick={() => navigate('/')}>
            Home
          </span>
          <span className="link" onClick={() => navigate('/settings')}>
            Settings
          </span>
          <button onClick={handleLogout} style={{ width: 'auto', padding: '8px 16px' }}>
            Logout
          </button>
        </div>
      </nav>
      <div className="container">
        <div className="form-container" style={{ margin: '50px auto' }}>
          <h2 className="text-center">Account Settings</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={user?.username || ''}
                disabled
                style={{ backgroundColor: '#f5f5f5' }}
              />
              <small style={{ color: '#666' }}>Username cannot be changed</small>
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">New Password (leave blank to keep current)</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
              />
            </div>
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}
            <button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Account'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export default Account;
