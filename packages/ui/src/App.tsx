import { Routes, Route, Navigate } from 'react-router-dom';
import { SessionsPage } from './pages/SessionsPage.js';
import { SessionPage } from './pages/SessionPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { AppLayout } from './components/layout/AppLayout.js';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/sessions" replace />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/sessions/:id" element={<SessionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
