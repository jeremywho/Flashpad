import { useNavigate } from 'react-router-dom';
import { AppearancePane } from '../components/AppearancePane';

function Settings() {
  const navigate = useNavigate();

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
          <AppearancePane />
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
