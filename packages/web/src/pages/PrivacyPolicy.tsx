import { useNavigate } from 'react-router-dom';

function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="privacy-page">
      <div className="privacy-container">
        <header className="privacy-header">
          <button className="settings-back" onClick={() => navigate('/')}>
            &larr; Back
          </button>
          <h1>Privacy Policy</h1>
        </header>

        <div className="privacy-content">
          <p className="privacy-updated">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

          <section>
            <h2>Introduction</h2>
            <p>
              Flashpad ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our note-taking application across all platforms (web, desktop, and mobile).
            </p>
          </section>

          <section>
            <h2>Information We Collect</h2>
            <h3>Account Information</h3>
            <p>When you create an account, we collect:</p>
            <ul>
              <li>Username</li>
              <li>Email address</li>
              <li>Password (stored securely using industry-standard hashing)</li>
              <li>Full name (optional)</li>
            </ul>

            <h3>Note Content</h3>
            <p>
              We store the notes you create, including their content, categories, and metadata (creation date, modification date, etc.) to provide our service.
            </p>

            <h3>Device Information</h3>
            <p>
              We collect device identifiers to enable sync functionality across your devices and to help troubleshoot technical issues.
            </p>
          </section>

          <section>
            <h2>How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Provide and maintain our service</li>
              <li>Sync your notes across devices</li>
              <li>Authenticate your identity</li>
              <li>Send service-related communications</li>
              <li>Improve our application</li>
            </ul>
          </section>

          <section>
            <h2>Data Storage and Security</h2>
            <p>
              Your data is stored on secure servers. We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.
            </p>
            <p>
              All data transmission between your devices and our servers is encrypted using TLS (Transport Layer Security).
            </p>
          </section>

          <section>
            <h2>Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. Deleted notes are moved to trash and can be permanently deleted at your discretion. If you delete your account, all associated data will be permanently removed from our servers.
            </p>
          </section>

          <section>
            <h2>Third-Party Services</h2>
            <p>
              We do not sell, trade, or otherwise transfer your personal information to third parties. We may use third-party services for:
            </p>
            <ul>
              <li>Hosting infrastructure</li>
              <li>App distribution (App Store, Google Play)</li>
            </ul>
            <p>
              These services have their own privacy policies governing their use of data.
            </p>
          </section>

          <section>
            <h2>Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your account and data</li>
              <li>Export your notes</li>
            </ul>
          </section>

          <section>
            <h2>Children's Privacy</h2>
            <p>
              Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section>
            <h2>Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2>Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:privacy@flashpad.cc">privacy@flashpad.cc</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicy;
