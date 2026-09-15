import { CssBaseline, ThemeProvider, Typography, createTheme } from '@mui/material';
import { createRoot } from 'react-dom/client';

const theme = createTheme({
  palette: {
    background: { default: '#f7f6f1' },
    primary: { main: '#66806a' },
    text: { primary: '#18352a' },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <main style={{ padding: '32px' }}>
        <Typography component="h1" variant="h3">Bazols</Typography>
        <Typography sx={{ marginTop: 2 }}>Рабочее пространство отчётов готовится.</Typography>
      </main>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
