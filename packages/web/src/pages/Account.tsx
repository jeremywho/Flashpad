import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

function Account() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <button className="settings-back" onClick={() => navigate('/app')}>
            &larr; Back
          </button>
          <h1>Account</h1>
        </div>

        <div className="settings-section">
          <h2>Profile</h2>
          <div className="settings-item">
            <span>Username</span>
            <span className="settings-value">{user?.username}</span>
          </div>
          <div className="settings-item">
            <span>Email</span>
            <span className="settings-value">{user?.email}</span>
          </div>
          {user?.fullName && (
            <div className="settings-item">
              <span>Full Name</span>
              <span className="settings-value">{user.fullName}</span>
            </div>
          )}
        </div>

        <div className="settings-section">
          <button className="settings-logout-btn" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default Account;
