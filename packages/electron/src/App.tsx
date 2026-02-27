import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Account from './pages/Account';
import Settings from './pages/Settings';
import QuickCapture from './pages/QuickCapture';
import QuickCaptureCode from './pages/QuickCaptureCode';
import { isMigrationNeeded, migrateFromLocalStorage } from './services/migration';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="container"><h2>Loading...</h2></div>;
  }

  return user ? <>{children}</> : <Navigate to="/login" />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="container"><h2>Loading...</h2></div>;
  }

  return !user ? <>{children}</> : <Navigate to="/" />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/quick-capture" element={<QuickCapture />} />
      <Route path="/quick-capture-code" element={<QuickCaptureCode />} />
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
        path="/"
        element={
          <PrivateRoute>
            <Home />
          </PrivateRoute>
        }
      />
      <Route
        path="/account"
        element={
          <PrivateRoute>
            <Account />
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <Settings />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

function App() {
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    const runMigration = async () => {
      if (isMigrationNeeded()) {
        setIsMigrating(true);
        try {
          const result = await migrateFromLocalStorage();
          console.log('Migration complete:', result);
        } catch (error) {
          console.error('Migration failed:', error);
        } finally {
          setIsMigrating(false);
        }
      }
    };

    runMigration();
  }, []);

  if (isMigrating) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Migrating data...</h2>
          <p>Please wait while we migrate your notes to the new file-based storage.</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
