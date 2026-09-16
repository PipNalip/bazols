import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
} from '@mui/material';

import type { RestaurantOption } from '../reports/api.js';

type CreateValues = { username: string; temporaryPassword: string; restaurantIds: string[] };
type AssignmentValues = { restaurantIds: string[] };

export function ManagerDialog({
  open,
  restaurants,
  initialRestaurantIds = [],
  mode,
  onClose,
  onSubmit,
}: {
  open: boolean;
  restaurants: RestaurantOption[];
  initialRestaurantIds?: string[];
  mode: 'create' | 'assignments';
  onClose: () => void;
  onSubmit: (values: CreateValues | AssignmentValues) => void | Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [restaurantIds, setRestaurantIds] = useState<string[]>(initialRestaurantIds);

  useEffect(() => {
    if (open) {
      setUsername('');
      setTemporaryPassword('');
      setRestaurantIds(initialRestaurantIds);
    }
  }, [open, initialRestaurantIds]);

  const toggle = (id: string) => {
    setRestaurantIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === 'create' ? 'Новый менеджер' : 'Назначения ресторанов'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {mode === 'create' ? (
            <>
              <TextField label="Логин" value={username} onChange={(event) => setUsername(event.target.value)} />
              <TextField label="Временный пароль" type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} helperText="Не менее 12 символов" />
            </>
          ) : null}
          <Stack aria-label="Рестораны">
            {restaurants.map((restaurant) => (
              <FormControlLabel
                key={restaurant.id}
                control={<Checkbox checked={restaurantIds.includes(restaurant.id)} onChange={() => toggle(restaurant.id)} />}
                label={restaurant.displayName}
              />
            ))}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={mode === 'create' && (!username.trim() || temporaryPassword.length < 12)}
          onClick={() => void onSubmit(mode === 'create' ? { username: username.trim(), temporaryPassword, restaurantIds } : { restaurantIds })}
        >
          {mode === 'create' ? 'Создать менеджера' : 'Сохранить назначения'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
