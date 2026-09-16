import { Box, CircularProgress, Typography } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider.js';
import { LoginPage } from '../auth/LoginPage.js';
import { ReportsPage } from '../reports/ReportsPage.js';
import { AppShell } from './AppShell.js';

export function AppRouter() {
  const auth = useAuth();
  if (auth.status === 'loading') {
    return (
      <Box
        role="status"
        aria-label="Проверка сессии"
        sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}
      >
        <Box>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Проверяем сессию…</Typography>
        </Box>
      </Box>
    );
  }
  if (auth.status === 'anonymous') {
    return (
      <Routes>
        <Route
          path="*"
          element={<LoginPage onLogin={auth.login} sessionExpired={auth.sessionExpired} />}
        />
      </Routes>
    );
  }
  return (
    <AppShell user={auth.user} onLogout={auth.logout}>
      <Routes>
        <Route path="/" element={<ReportsPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </AppShell>
  );
}
