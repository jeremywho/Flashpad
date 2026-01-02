import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import type { AppSettings } from '../types/electron';

function Settings() {
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings>({
    minimizeToTray: true,
    startMinimized: false,
    closeToTray: true,
    quickCaptureHotkey: 'CommandOrControl+Alt+N',
    theme: 'dark',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await window.electron?.settings.get();
      if (currentSettings) {
        setSettings(currentSettings);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess('');

    try {
      await window.electron?.settings.set(settings);
      setSuccess('Settings saved successfully!');
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    setSuccess('');

    try {
      const resetSettings = await window.electron?.settings.reset();
      if (resetSettings) {
        setSettings(resetSettings);
        setTheme(resetSettings.theme);
        setSuccess('Settings reset to defaults!');
      }
    } catch (err) {
      console.error('Failed to reset settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleThemeChange = (newTheme: 'dark' | 'light' | 'system') => {
    setSettings({ ...settings, theme: newTheme });
    setTheme(newTheme);
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
          <span className="link" onClick={() => navigate('/account')}>
            Account
          </span>
          <button onClick={handleLogout} style={{ width: 'auto', padding: '8px 16px' }}>
            Logout
          </button>
        </div>
      </nav>
      <div className="container">
        <div className="form-container" style={{ margin: '50px auto' }}>
          <h2 className="text-center">App Settings</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Theme</label>
              <div className="settings-theme-options">
                <button
                  type="button"
                  className={`settings-theme-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('dark')}
                >
                  Dark
                </button>
                <button
                  type="button"
                  className={`settings-theme-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('light')}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={`settings-theme-btn ${theme === 'system' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('system')}
                >
                  System
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Quick Capture Hotkey</label>
              <input
                type="text"
                value={settings.quickCaptureHotkey}
                onChange={(e) =>
                  setSettings({ ...settings, quickCaptureHotkey: e.target.value })
                }
                placeholder="e.g., CommandOrControl+Alt+N"
              />
              <small className="settings-hint">
                Use Ctrl/Cmd+Alt+N format (e.g., CommandOrControl+Shift+N)
              </small>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.closeToTray}
                  onChange={(e) =>
                    setSettings({ ...settings, closeToTray: e.target.checked })
                  }
                  style={{ width: 'auto', marginRight: '10px' }}
                />
                <span>Close to tray instead of quitting</span>
              </label>
              <small className="settings-hint" style={{ marginLeft: '30px' }}>
                When enabled, closing the window minimizes the app to the system tray.
              </small>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.minimizeToTray}
                  onChange={(e) =>
                    setSettings({ ...settings, minimizeToTray: e.target.checked })
                  }
                  style={{ width: 'auto', marginRight: '10px' }}
                />
                <span>Minimize to tray</span>
              </label>
              <small className="settings-hint" style={{ marginLeft: '30px' }}>
                When enabled, minimizing the window sends it to the system tray.
              </small>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.startMinimized}
                  onChange={(e) =>
                    setSettings({ ...settings, startMinimized: e.target.checked })
                  }
                  style={{ width: 'auto', marginRight: '10px' }}
                />
                <span>Start minimized to tray</span>
              </label>
              <small className="settings-hint" style={{ marginLeft: '30px' }}>
                When enabled, the app starts in the system tray without showing the main window.
              </small>
            </div>

            {success && <div className="success">{success}</div>}

            <button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Settings'}
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="settings-reset-btn"
            >
              Reset to Defaults
            </button>
          </form>

          <div className="settings-tips">
            <h3>System Tray Tips</h3>
            <ul>
              <li><strong>Windows:</strong> Click tray icon to show/hide window. Right-click for menu.</li>
              <li><strong>macOS/Linux:</strong> Double-click tray icon to show window. Right-click for menu.</li>
              <li>Use the "Quit" option in the tray context menu to completely exit the app.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

export default Settings;
