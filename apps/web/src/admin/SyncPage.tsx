import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { createRestaurant, discoverSource, enqueueSync, listAdminRestaurants, listSyncRuns } from './api.js';
import { RestaurantDialog } from './RestaurantDialog.js';
import { SyncRunTable } from './SyncRunTable.js';

function firstDay(value: string): string {
  return `${value.slice(0, 8)}01`;
}

export function SyncPage({ csrfToken, today = new Date().toISOString().slice(0, 10) }: { csrfToken: string; today?: string }) {
  const client = useQueryClient();
  const restaurants = useQuery({
    queryKey: ['restaurants'],
    queryFn: listAdminRestaurants,
    refetchInterval: (query) => query.state.data?.some(
      (restaurant) => restaurant.latestSync?.status === 'QUEUED' || restaurant.latestSync?.status === 'RUNNING',
    ) ? 2_000 : false,
  });
  const history = useQuery({
    queryKey: ['admin', 'sync-runs'],
    queryFn: listSyncRuns,
    refetchInterval: (query) => query.state.data?.items.some((run) => run.status === 'QUEUED' || run.status === 'RUNNING') ? 2_000 : false,
  });
  const [selectedId, setSelectedId] = useState('');
  const [beginDate, setBeginDate] = useState(firstDay(today));
  const [endDate, setEndDate] = useState(today);
  const [notice, setNotice] = useState('');
  const [restaurantDialogOpen, setRestaurantDialogOpen] = useState(false);
  const sourceUnits = useQuery({
    queryKey: ['source-discovery'],
    queryFn: discoverSource,
    enabled: restaurantDialogOpen,
  });

  const restaurantRows = restaurants.data ?? [];
  const restaurantId = selectedId || restaurantRows[0]?.id || '';
  const selected = restaurantRows.find((item) => item.id === restaurantId);
  const active = selected?.latestSync?.status === 'QUEUED' || selected?.latestSync?.status === 'RUNNING';
  const validation = useMemo(() => {
    if (!beginDate || !endDate) return 'Укажите дату начала и окончания.';
    if (beginDate > endDate) return 'Дата начала должна быть не позже даты окончания.';
    if (endDate > today) return 'Дата окончания не может быть в будущем.';
    return null;
  }, [beginDate, endDate, today]);

  const enqueue = useMutation({
    mutationFn: () => enqueueSync({ restaurantId, beginDate, endDate }, { csrfToken }),
    onSuccess: async () => {
      setNotice('Синхронизация поставлена в очередь');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['restaurants'] }),
        client.invalidateQueries({ queryKey: ['admin', 'sync-runs'] }),
      ]);
    },
  });
  const createMapping = useMutation({
    mutationFn: (input: { displayName: string; sourceUnitId: string; sourceRole: string; timezone: string }) =>
      createRestaurant(input, { csrfToken }),
    onSuccess: async (created) => {
      setRestaurantDialogOpen(false);
      setNotice('Ресторан добавлен. Теперь можно запустить синхронизацию.');
      await client.invalidateQueries({ queryKey: ['restaurants'] });
      setSelectedId(created.id);
    },
  });

  if (restaurants.isError || history.isError) {
    return <Alert severity="error">Не удалось загрузить журнал синхронизаций.</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}>
        <div>
          <Typography component="h1" variant="h4">Синхронизация</Typography>
          <Typography color="text.secondary">Ручной импорт и история запусков</Typography>
        </div>
        <Button variant="outlined" onClick={() => setRestaurantDialogOpen(true)}>Добавить ресторан</Button>
      </Stack>

      {notice ? <Alert role="status" severity="success" onClose={() => setNotice('')}>{notice}</Alert> : null}
      {enqueue.isError ? <Alert severity="error">Не удалось поставить синхронизацию в очередь.</Alert> : null}
      {sourceUnits.isError ? <Alert severity="error">Не удалось получить доступные подразделения источника.</Alert> : null}
      {createMapping.isError ? <Alert severity="error">Не удалось сохранить ресторан.</Alert> : null}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'flex-start' } }}>
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel id="sync-restaurant-label">Ресторан</InputLabel>
          <Select labelId="sync-restaurant-label" label="Ресторан" value={restaurantId} onChange={(event) => setSelectedId(event.target.value)}>
            {restaurantRows.map((restaurant) => <MenuItem key={restaurant.id} value={restaurant.id}>{restaurant.displayName}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Дата начала" type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Дата окончания" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="contained" disabled={!restaurantId || Boolean(validation) || active || enqueue.isPending} onClick={() => enqueue.mutate()}>Запустить синхронизацию</Button>
      </Stack>

      {validation ? <Alert severity="warning">{validation}</Alert> : null}
      {active ? <Alert severity="info">Для ресторана уже выполняется синхронизация.</Alert> : null}
      {!restaurants.isLoading && restaurantRows.length === 0 ? <Alert severity="info">Сначала добавьте ресторан.</Alert> : null}

      <section aria-labelledby="sync-history-heading">
        <Typography id="sync-history-heading" component="h2" variant="h5" sx={{ mb: 2 }}>Журнал запусков</Typography>
        <SyncRunTable runs={history.data?.items ?? []} restaurants={restaurantRows} />
      </section>
      {restaurantDialogOpen ? (
        <RestaurantDialog
          open
          units={sourceUnits.data ?? []}
          onClose={() => setRestaurantDialogOpen(false)}
          onSubmit={async (input) => { await createMapping.mutateAsync(input); }}
        />
      ) : null}
    </Stack>
  );
}
