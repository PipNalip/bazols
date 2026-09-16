import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import { ManagerDialog } from './ManagerDialog.js';
import {
  blockManager,
  createManager,
  listAdminRestaurants,
  listManagers,
  replaceAssignments,
  resetManagerPassword,
  type Manager,
} from './api.js';

export function UsersPage({ csrfToken }: { csrfToken: string }) {
  const client = useQueryClient();
  const managers = useQuery({ queryKey: ['admin', 'users'], queryFn: listManagers });
  const restaurants = useQuery({ queryKey: ['restaurants'], queryFn: listAdminRestaurants });
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'assignments'; manager: Manager } | null>(null);
  const [resetTarget, setResetTarget] = useState<Manager | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [notice, setNotice] = useState('');

  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<Manager>) => operation(),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const complete = async (operation: () => Promise<Manager>, message: string) => {
    await mutation.mutateAsync(operation);
    setNotice(message);
  };

  if (managers.isError || restaurants.isError) {
    return <Alert severity="error">Не удалось загрузить данные администрирования.</Alert>;
  }

  const rows = managers.data ?? [];
  const restaurantRows = restaurants.data ?? [];

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <div>
          <Typography component="h1" variant="h4">Пользователи</Typography>
          <Typography color="text.secondary">Менеджеры и доступ к ресторанам</Typography>
        </div>
        <Button variant="contained" onClick={() => setDialog({ mode: 'create' })}>Добавить менеджера</Button>
      </Stack>

      {notice ? <Alert role="status" severity="success" onClose={() => setNotice('')}>{notice}</Alert> : null}
      {mutation.isError ? <Alert severity="error">Операция не выполнена. Проверьте данные и повторите.</Alert> : null}

      <TableContainer component={Paper} variant="outlined">
        <Table aria-label="Менеджеры">
          <TableHead><TableRow><TableCell>Логин</TableCell><TableCell>Статус</TableCell><TableCell>Рестораны</TableCell><TableCell align="right">Действия</TableCell></TableRow></TableHead>
          <TableBody>
            {rows.map((manager) => (
              <TableRow key={manager.id}>
                <TableCell>{manager.username}</TableCell>
                <TableCell><Chip size="small" label={manager.active ? 'Активен' : 'Заблокирован'} color={manager.active ? 'success' : 'default'} /></TableCell>
                <TableCell>{manager.restaurantIds.map((id) => restaurantRows.find((item) => item.id === id)?.displayName ?? id).join(', ') || 'Нет назначений'}</TableCell>
                <TableCell align="right">
                  <Stack direction={{ xs: 'column', lg: 'row' }} sx={{ justifyContent: 'flex-end' }}>
                    <Button aria-label={`Изменить рестораны для ${manager.username}`} onClick={() => setDialog({ mode: 'assignments', manager })}>Рестораны</Button>
                    <Button aria-label={`Сбросить пароль для ${manager.username}`} onClick={() => { setTemporaryPassword(''); setResetTarget(manager); }}>Пароль</Button>
                    <Button color="error" disabled={!manager.active || mutation.isPending} aria-label={`Заблокировать ${manager.username}`} onClick={() => void complete(() => blockManager(manager.id, { csrfToken }), 'Менеджер заблокирован')}>Заблокировать</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!managers.isLoading && rows.length === 0 ? <TableRow><TableCell colSpan={4}>Менеджеров пока нет.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </TableContainer>

      {dialog ? (
        <ManagerDialog
          open
          mode={dialog.mode}
          restaurants={restaurantRows}
          initialRestaurantIds={dialog.mode === 'assignments' ? dialog.manager.restaurantIds : []}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            if (dialog.mode === 'assignments') {
              await complete(() => replaceAssignments(dialog.manager.id, values.restaurantIds, { csrfToken }), 'Назначения сохранены');
            } else if ('username' in values) {
              await complete(() => createManager(values, { csrfToken }), 'Менеджер создан');
            }
            setDialog(null);
          }}
        />
      ) : null}

      <Dialog open={resetTarget !== null} onClose={() => setResetTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Сбросить пароль</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField fullWidth label="Новый временный пароль" type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} helperText="Не менее 12 символов" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetTarget(null)}>Отмена</Button>
          <Button variant="contained" disabled={temporaryPassword.length < 12 || mutation.isPending} onClick={async () => {
            if (!resetTarget) return;
            await complete(() => resetManagerPassword(resetTarget.id, temporaryPassword, { csrfToken }), 'Пароль сброшен');
            setResetTarget(null);
          }}>Сбросить пароль</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
