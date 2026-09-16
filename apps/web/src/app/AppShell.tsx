import { useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Divider,
  Drawer,
  Stack,
  Typography,
} from '@mui/material';
import { NavLink } from 'react-router-dom';

import { colors, layout } from '../theme/tokens.js';

export type ShellUser = {
  id: string;
  username: string;
  role: 'ADMIN' | 'MANAGER';
};

type AppShellProps = {
  user: ShellUser;
  onLogout: () => void | Promise<void>;
  children: ReactNode;
};

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const links = [{ to: '/', label: 'Рейтинги' }];
  return (
    <Stack component="nav" aria-label="Основная навигация" spacing={0.75}>
      {links.map((link) => (
        <Button
          component={NavLink}
          key={link.to}
          onClick={onNavigate}
          sx={{
            justifyContent: 'flex-start',
            color: 'text.primary',
            px: 1.5,
            '&.active': { bgcolor: colors.surfaceMuted, color: colors.sageDark },
          }}
          to={link.to}
        >
          {link.label}
        </Button>
      ))}
    </Stack>
  );
}

export function AppShell({ user, onLogout, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'fixed',
          top: 8,
          left: 8,
          zIndex: 2000,
          transform: 'translateY(-150%)',
          bgcolor: 'background.paper',
          color: 'text.primary',
          p: 1,
          '&:focus': { transform: 'translateY(0)' },
        }}
      >
        Перейти к содержимому
      </Box>

      <Box
        component="header"
        sx={{
          display: { xs: 'flex', md: 'none' },
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography sx={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 23 }}>
          Bazols
        </Typography>
        <Button aria-label="Открыть меню" onClick={() => setMobileOpen(true)}>
          Меню
        </Button>
      </Box>

      <Box
        component="aside"
        sx={{
          display: { xs: 'none', md: 'flex' },
          position: 'fixed',
          inset: '0 auto 0 0',
          width: layout.railWidth,
          flexDirection: 'column',
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
          p: 3,
        }}
      >
        <Typography sx={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 29 }}>
          Bazols
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, mb: 4 }}>
          Отчёты ресторана
        </Typography>
        <Navigation />
        <Box sx={{ mt: 'auto' }}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" sx={{ mb: 1 }}>
            {user.username}
          </Typography>
          <Button color="inherit" onClick={() => void onLogout()} sx={{ p: 0 }}>
            Выйти
          </Button>
        </Box>
      </Box>

      {mobileOpen ? (
        <Drawer
          anchor="left"
          open
          onClose={() => setMobileOpen(false)}
          slotProps={{ paper: { role: 'dialog', 'aria-label': 'Навигация' } }}
        >
          <Stack sx={{ width: 280, p: 2.5 }} spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 24 }}>
                Bazols
              </Typography>
              <Button aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}>
                Закрыть
              </Button>
            </Box>
            <Navigation onNavigate={() => setMobileOpen(false)} />
            <Button color="inherit" onClick={() => void onLogout()}>
              Выйти
            </Button>
          </Stack>
        </Drawer>
      ) : null}

      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{
          ml: { xs: 0, md: `${layout.railWidth}px` },
          maxWidth: layout.contentMaxWidth,
          p: { xs: 2, sm: 3, lg: 5 },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
