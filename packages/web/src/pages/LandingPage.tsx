import { useNavigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';

function LandingPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  };

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-content">
          <h1 className="landing-logo">Flashpad</h1>
          <nav className="landing-nav">
            <button
              className="landing-theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="landing-nav-btn" onClick={() => navigate('/login')}>
              Sign In
            </button>
            <button className="landing-nav-btn primary" onClick={() => navigate('/register')}>
              Get Started
            </button>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <h2 className="landing-hero-title">Capture First, Organize Later</h2>
          <p className="landing-hero-subtitle">
            A minimal-friction note-taking app that syncs across all your devices.
          </p>
          <div className="landing-hero-cta">
            <button className="landing-cta-btn primary" onClick={() => navigate('/register')}>
              Get Started Free
            </button>
            <button className="landing-cta-btn" onClick={() => navigate('/login')}>
              Sign In
            </button>
          </div>
        </section>

        <section className="landing-features">
          <h3 className="landing-section-title">Why Flashpad?</h3>
          <div className="landing-features-grid">
            <div className="landing-feature-card">
              <span className="landing-feature-icon">⚡</span>
              <h4>Quick Capture</h4>
              <p>Global hotkey (Ctrl+Alt+N) for instant notes. Never lose a thought.</p>
            </div>
            <div className="landing-feature-card">
              <span className="landing-feature-icon">🔄</span>
              <h4>Cross-Platform Sync</h4>
              <p>Windows, macOS, Linux, web, iOS, and Android. Your notes everywhere.</p>
            </div>
            <div className="landing-feature-card">
              <span className="landing-feature-icon">📁</span>
              <h4>Organize Your Way</h4>
              <p>Categories and inbox workflow. Sort when you're ready, not when you're busy.</p>
            </div>
            <div className="landing-feature-card">
              <span className="landing-feature-icon">🌙</span>
              <h4>Dark Mode</h4>
              <p>Beautiful dark and light themes. Easy on the eyes, day or night.</p>
            </div>
          </div>
        </section>

        <section className="landing-download">
          <h3 className="landing-section-title">Get Flashpad</h3>
          <div className="landing-download-options">
            <div className="landing-download-group">
              <h4>Desktop</h4>
              <button
                className="landing-download-btn"
                onClick={() => navigate('/download')}
                style={{ border: 'none', cursor: 'pointer' }}
              >
                Download for Desktop
              </button>
              <p className="landing-download-note">Windows, macOS, Linux</p>
            </div>
            <div className="landing-download-group">
              <h4>Mobile</h4>
              <div className="landing-store-badges">
                <span className="landing-store-badge" title="Coming soon">
                  App Store
                </span>
                <span className="landing-store-badge" title="Coming soon">
                  Play Store
                </span>
              </div>
              <p className="landing-download-note">Coming soon</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-content">
          <p className="landing-footer-links">
            <span className="link" onClick={() => navigate('/privacy')}>
              Privacy Policy
            </span>
          </p>
          <p className="landing-footer-copyright">
            &copy; {new Date().getFullYear()} Flashpad. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
