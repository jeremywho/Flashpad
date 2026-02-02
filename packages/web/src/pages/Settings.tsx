import { useNavigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';

function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <button className="settings-back" onClick={() => navigate('/app')}>
            &larr; Back
          </button>
          <h1>Settings</h1>
        </div>

        <div className="settings-section">
          <h2>Appearance</h2>
          <div className="settings-item">
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>

        <div className="settings-section">
          <h2>About</h2>
          <div className="settings-item">
            <span>Flashpad Web</span>
            <span className="settings-value">v0.1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
