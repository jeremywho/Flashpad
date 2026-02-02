import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

type Platform = 'mac' | 'mac-intel' | 'windows' | 'linux' | 'unknown';

function detectPlatform(): Platform {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  if (platform.includes('mac') || userAgent.includes('mac')) {
    // Check for Apple Silicon vs Intel
    // This is a heuristic - not 100% reliable but good enough
    if (userAgent.includes('arm') || (navigator as any).userAgentData?.platform === 'macOS') {
      return 'mac'; // Default to ARM for modern Macs
    }
    return 'mac';
  }
  if (platform.includes('win') || userAgent.includes('win')) {
    return 'windows';
  }
  if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  }
  return 'unknown';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAssetForPlatform(assets: ReleaseAsset[], platform: Platform): ReleaseAsset | null {
  for (const asset of assets) {
    const name = asset.name.toLowerCase();

    if (platform === 'mac' && name.includes('arm64') && name.endsWith('.dmg')) {
      return asset;
    }
    if (platform === 'mac-intel' && !name.includes('arm64') && name.endsWith('.dmg')) {
      return asset;
    }
    if (platform === 'windows' && name.endsWith('.exe')) {
      return asset;
    }
    if (platform === 'linux' && name.endsWith('.appimage')) {
      return asset;
    }
  }

  // Fallback for mac - try any .dmg
  if (platform === 'mac' || platform === 'mac-intel') {
    const dmg = assets.find(a => a.name.toLowerCase().endsWith('.dmg'));
    if (dmg) return dmg;
  }

  return null;
}

function getPlatformInfo(platform: Platform): { name: string; icon: string } {
  switch (platform) {
    case 'mac':
      return { name: 'macOS (Apple Silicon)', icon: '🍎' };
    case 'mac-intel':
      return { name: 'macOS (Intel)', icon: '🍎' };
    case 'windows':
      return { name: 'Windows', icon: '🪟' };
    case 'linux':
      return { name: 'Linux', icon: '🐧' };
    default:
      return { name: 'Unknown', icon: '💻' };
  }
}

function Download() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detectedPlatform] = useState<Platform>(detectPlatform);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    async function fetchRelease() {
      try {
        const response = await fetch(
          'https://api.github.com/repos/jeremywho/flashpad/releases/latest'
        );
        if (!response.ok) {
          if (response.status === 404) {
            setError('No releases found yet.');
          } else {
            throw new Error('Failed to fetch release');
          }
          return;
        }
        const data = await response.json();
        setRelease(data);
      } catch (err) {
        setError('Unable to load downloads. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    fetchRelease();
  }, []);

  const recommendedAsset = release ? getAssetForPlatform(release.assets, detectedPlatform) : null;
  const platformInfo = getPlatformInfo(detectedPlatform);

  const allPlatforms: Platform[] = ['mac', 'mac-intel', 'windows', 'linux'];

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-content">
          <h1 className="landing-logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            Flashpad
          </h1>
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
          </nav>
        </div>
      </header>

      <main className="download-page-content">
        <section className="download-hero">
          <h2>Download Flashpad</h2>
          <p className="download-subtitle">
            Available for Windows, macOS, and Linux
          </p>

          {loading && (
            <div className="download-loading">
              <p>Loading latest release...</p>
            </div>
          )}

          {error && (
            <div className="download-error">
              <p>{error}</p>
              <a
                href="https://github.com/jeremywho/flashpad/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="landing-download-btn"
              >
                View All Releases on GitHub
              </a>
            </div>
          )}

          {release && !error && (
            <>
              <div className="download-version">
                Version {release.tag_name.replace(/^v/, '')}
              </div>

              {recommendedAsset && detectedPlatform !== 'unknown' ? (
                <div className="download-recommended">
                  <p className="download-detected">
                    {platformInfo.icon} Detected: {platformInfo.name}
                  </p>
                  <a
                    href={recommendedAsset.browser_download_url}
                    className="download-primary-btn"
                  >
                    Download for {platformInfo.name}
                  </a>
                  <p className="download-file-info">
                    {recommendedAsset.name} ({formatBytes(recommendedAsset.size)})
                  </p>
                </div>
              ) : (
                <div className="download-recommended">
                  <p className="download-detected">
                    Select your platform below
                  </p>
                </div>
              )}

              <div className="download-other-platforms">
                <h3>All Platforms</h3>
                <div className="download-platform-grid">
                  {allPlatforms.map(platform => {
                    const asset = getAssetForPlatform(release.assets, platform);
                    const info = getPlatformInfo(platform);

                    if (!asset) return null;

                    return (
                      <a
                        key={platform}
                        href={asset.browser_download_url}
                        className={`download-platform-card ${platform === detectedPlatform ? 'recommended' : ''}`}
                      >
                        <span className="download-platform-icon">{info.icon}</span>
                        <span className="download-platform-name">{info.name}</span>
                        <span className="download-platform-size">{formatBytes(asset.size)}</span>
                      </a>
                    );
                  })}
                </div>
              </div>

              <div className="download-links">
                <a
                  href={release.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="download-link"
                >
                  Release Notes
                </a>
                <span className="download-link-separator">•</span>
                <a
                  href="https://github.com/jeremywho/flashpad/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="download-link"
                >
                  All Releases
                </a>
              </div>
            </>
          )}
        </section>

        <section className="download-mobile">
          <h3>Mobile Apps</h3>
          <p>Coming soon to iOS and Android</p>
          <div className="landing-store-badges">
            <span className="landing-store-badge">App Store</span>
            <span className="landing-store-badge">Play Store</span>
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

export default Download;
