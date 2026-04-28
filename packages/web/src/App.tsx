import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { AppearanceProvider } from './theme/AppearanceProvider';
import { CommandPalette } from './components/CommandPalette';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Account from './pages/Account';
import LandingPage from './pages/LandingPage';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Download from './pages/Download';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  return !isAuthenticated ? <>{children}</> : <Navigate to="/app" />;
}

function LandingRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  return isAuthenticated ? <Navigate to="/app" /> : <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppearanceProvider>
          <Routes>
            <Route
              path="/"
              element={
                <LandingRoute>
                  <LandingPage />
                </LandingRoute>
              }
            />
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              }
            />
            <Route
              path="/app"
              element={
                <PrivateRoute>
                  <Home />
                </PrivateRoute>
              }
            />
            <Route
              path="/app/settings"
              element={
                <PrivateRoute>
                  <Settings />
                </PrivateRoute>
              }
            />
            <Route
              path="/app/account"
              element={
                <PrivateRoute>
                  <Account />
                </PrivateRoute>
              }
            />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/download" element={<Download />} />
          </Routes>
          <CommandPalette />
        </AppearanceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
