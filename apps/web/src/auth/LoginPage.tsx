import { useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

export function LoginPage({
  onLogin,
  sessionExpired = false,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  sessionExpired?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(false);
    try {
      await onLogin(String(data.get('username')), String(data.get('password')));
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper
        component="section"
        elevation={0}
        sx={{ width: '100%', maxWidth: 430, border: 1, borderColor: 'divider', p: { xs: 3, sm: 5 } }}
      >
        <Typography sx={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 700 }}>
          Bazols
        </Typography>
        <Typography component="h1" variant="h2" sx={{ mt: 3 }}>
          Вход в отчёты
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          Используйте выданную администратором учётную запись.
        </Typography>
        <Stack component="form" onSubmit={(event) => void submit(event)} spacing={2.25}>
          {sessionExpired ? (
            <Alert severity="info">Сессия истекла. Войдите снова, чтобы продолжить.</Alert>
          ) : null}
          {error ? (
            <Alert severity="error">Не удалось войти. Проверьте логин и пароль.</Alert>
          ) : null}
          <TextField
            autoComplete="username"
            disabled={pending}
            fullWidth
            label="Логин"
            name="username"
            required
          />
          <TextField
            autoComplete="current-password"
            disabled={pending}
            fullWidth
            label="Пароль"
            name="password"
            required
            type="password"
          />
          <Button disabled={pending} size="large" type="submit" variant="contained">
            {pending ? (
              <>
                <CircularProgress color="inherit" size={18} sx={{ mr: 1 }} />
                Входим…
              </>
            ) : (
              'Войти'
            )}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
