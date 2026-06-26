import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SessionsPage } from './pages/SessionsPage.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

// Lazy-loaded pages — SessionPage pulls in CodeMirror, xterm, and other heavy deps
const SessionPage = lazy(() => import('./pages/SessionPage.js').then((m) => ({ default: m.SessionPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.js').then((m) => ({ default: m.SettingsPage })));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-950">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary label="Application">
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/sessions" replace />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route
            path="/sessions/:id"
            element={
              <ErrorBoundary label="Session">
                <Suspense fallback={<PageLoader />}>
                  <SessionPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/settings"
            element={
              <ErrorBoundary label="Settings">
                <Suspense fallback={<PageLoader />}>
                  <SettingsPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
