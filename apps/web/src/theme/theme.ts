import { createTheme } from '@mui/material/styles';

import { colors } from './tokens.js';

export const bazolsTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: colors.sage, dark: colors.sageDark, contrastText: '#FFFFFF' },
    secondary: { main: colors.copper },
    error: { main: colors.danger },
    background: { default: colors.canvas, paper: colors.surface },
    text: { primary: colors.ink, secondary: '#526159' },
    divider: colors.divider,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter, Aptos, "Segoe UI", sans-serif',
    h1: { fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 650, letterSpacing: '-0.03em' },
    h2: { fontSize: '1.35rem', fontWeight: 650 },
    button: { textTransform: 'none', fontWeight: 650 },
  },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        'html:focus-within': { scrollBehavior: 'smooth' },
        '@media (prefers-reduced-motion: reduce)': {
          'html:focus-within': { scrollBehavior: 'auto' },
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
          },
        },
        ':focus-visible': { outline: `3px solid ${colors.copper}`, outlineOffset: 2 },
      },
    },
  },
});
