import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';

import { ApiError } from '../auth/api.js';
import { EmployeeRankingTable } from './EmployeeRankingTable.js';
import { ProductRankingTable } from './ProductRankingTable.js';
import { ReportToolbar } from './ReportToolbar.js';
import {
  listRestaurants,
  loadEmployeeRanking,
  loadProductRanking,
  type EmployeeSort,
  type ProductSort,
} from './api.js';

function firstOfMonth(today: string) {
  return `${today.slice(0, 8)}01`;
}

function ReportMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', p: 4, textAlign: 'center' }}>
      <Typography component="h2" variant="h2">
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>
        {detail}
      </Typography>
    </Paper>
  );
}

export function ReportsPage({
  today = new Date().toISOString().slice(0, 10),
  pollInterval = 2_000,
}: {
  today?: string;
  pollInterval?: number;
}) {
  const [restaurantId, setRestaurantId] = useState('');
  const [from, setFrom] = useState(firstOfMonth(today));
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<'employees' | 'products'>('employees');
  const [employeeSort, setEmployeeSort] = useState<EmployeeSort>('revenue');
  const [productSort, setProductSort] = useState<ProductSort>('unitsSold');
  const periodError = !from || !to
    ? 'Укажите дату начала и окончания.'
    : from > to
      ? 'Дата начала должна быть не позже даты окончания.'
      : null;

  const restaurants = useQuery({
    queryKey: ['restaurants'],
    queryFn: listRestaurants,
    refetchInterval: (query) => query.state.data?.some(
      (restaurant) => restaurant.latestSync?.status === 'QUEUED' || restaurant.latestSync?.status === 'RUNNING',
    ) ? pollInterval : false,
  });
  useEffect(() => {
    if (!restaurantId && restaurants.data?.[0]) setRestaurantId(restaurants.data[0].id);
  }, [restaurantId, restaurants.data]);

  const selectedRestaurant = useMemo(
    () => restaurants.data?.find((item) => item.id === restaurantId),
    [restaurantId, restaurants.data],
  );
  const syncActive = selectedRestaurant?.latestSync?.status === 'QUEUED' ||
    selectedRestaurant?.latestSync?.status === 'RUNNING';
  const wasSyncActive = useRef(false);

  const employees = useQuery({
    queryKey: ['employee-ranking', restaurantId, from, to, employeeSort],
    queryFn: () => loadEmployeeRanking(restaurantId, from, to, employeeSort),
    enabled: Boolean(restaurantId) && tab === 'employees' && periodError === null,
  });
  const products = useQuery({
    queryKey: ['product-ranking', restaurantId, from, to, productSort],
    queryFn: () => loadProductRanking(restaurantId, from, to, productSort),
    enabled: Boolean(restaurantId) && tab === 'products' && periodError === null,
  });

  const current = tab === 'employees' ? employees : products;

  useEffect(() => {
    if (wasSyncActive.current && selectedRestaurant?.latestSync?.status === 'SUCCEEDED') {
      void employees.refetch();
      void products.refetch();
    }
    wasSyncActive.current = syncActive;
  }, [employees.refetch, products.refetch, selectedRestaurant?.latestSync?.status, syncActive]);

  if (restaurants.isPending) {
    return (
      <Box role="progressbar" aria-label="Загрузка отчёта" sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (restaurants.isError) {
    return (
      <Alert
        severity="error"
        action={<Button onClick={() => void restaurants.refetch()}>Повторить</Button>}
      >
        Не удалось загрузить список ресторанов.
      </Alert>
    );
  }
  if (restaurants.data.length === 0) {
    return (
      <ReportMessage
        title="Нет доступных ресторанов"
        detail="Обратитесь к администратору, чтобы получить доступ."
      />
    );
  }

  const forbidden = current.error instanceof ApiError && current.error.status === 403;
  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          Рейтинги
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          Сравнивайте результат команды и спрос на товары за выбранный период.
        </Typography>
      </Box>

      <ReportToolbar
        from={from}
        onFromChange={setFrom}
        onRestaurantChange={setRestaurantId}
        onToChange={setTo}
        restaurantId={restaurantId}
        restaurants={restaurants.data}
        to={to}
      />

      {selectedRestaurant?.latestSync?.status === 'FAILED' ? (
        <Alert severity="warning">
          Последняя синхронизация завершилась ошибкой. Показаны последние успешно загруженные данные.
        </Alert>
      ) : null}
      {selectedRestaurant?.latestSync?.status === 'QUEUED' ||
      selectedRestaurant?.latestSync?.status === 'RUNNING' ? (
        <Alert severity="info">Синхронизация выполняется. Отчёт обновится после завершения.</Alert>
      ) : null}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs onChange={(_, value: 'employees' | 'products') => setTab(value)} value={tab}>
            <Tab label="Сотрудники" value="employees" />
            <Tab label="Товары" value="products" />
          </Tabs>
        </Box>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Typography component="h2" variant="h2">
              {tab === 'employees' ? 'Рейтинг сотрудников' : 'Рейтинг товаров'}
            </Typography>
            {tab === 'employees' ? (
              <ButtonGroup aria-label="Сортировка сотрудников" size="small">
                <Button aria-pressed={employeeSort === 'revenue'} variant={employeeSort === 'revenue' ? 'contained' : 'outlined'} onClick={() => setEmployeeSort('revenue')}>По выручке</Button>
                <Button aria-pressed={employeeSort === 'ordersCount'} variant={employeeSort === 'ordersCount' ? 'contained' : 'outlined'} onClick={() => setEmployeeSort('ordersCount')}>По заказам</Button>
                <Button aria-pressed={employeeSort === 'averageCheque'} variant={employeeSort === 'averageCheque' ? 'contained' : 'outlined'} onClick={() => setEmployeeSort('averageCheque')}>По среднему чеку</Button>
              </ButtonGroup>
            ) : (
              <Box aria-label="Сортировка товаров" role="group" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Button aria-pressed={productSort === 'unitsSold'} variant={productSort === 'unitsSold' ? 'contained' : 'outlined'} onClick={() => setProductSort('unitsSold')}>По количеству</Button>
                <Button aria-pressed={productSort === 'revenue'} variant={productSort === 'revenue' ? 'contained' : 'outlined'} onClick={() => setProductSort('revenue')}>По выручке</Button>
                <Button aria-pressed={productSort === 'cogs'} variant={productSort === 'cogs' ? 'contained' : 'outlined'} onClick={() => setProductSort('cogs')}>По себестоимости</Button>
                <Button aria-pressed={productSort === 'grossMargin'} variant={productSort === 'grossMargin' ? 'contained' : 'outlined'} onClick={() => setProductSort('grossMargin')}>По валовой марже</Button>
              </Box>
            )}
          </Box>

          {periodError ? (
            <Alert severity="error">{periodError}</Alert>
          ) : current.isPending ? (
            <Box role="progressbar" aria-label="Загрузка отчёта" sx={{ display: 'grid', placeItems: 'center', minHeight: 220 }}>
              <CircularProgress />
            </Box>
          ) : forbidden ? (
            <ReportMessage title="Доступ к отчёту запрещён" detail="Выберите доступный ресторан или обратитесь к администратору." />
          ) : current.isError ? (
            <Alert severity="error" action={<Button onClick={() => void current.refetch()}>Повторить</Button>}>
              Не удалось загрузить отчёт.
            </Alert>
          ) : tab === 'employees' && employees.data?.length === 0 ? (
            <ReportMessage title="За период нет данных" detail="Измените период или дождитесь следующей синхронизации." />
          ) : tab === 'products' && products.data?.rows.length === 0 ? (
            <ReportMessage title="За период нет данных" detail="Измените период или дождитесь следующей синхронизации." />
          ) : tab === 'employees' ? (
            <EmployeeRankingTable rows={employees.data ?? []} />
          ) : (
            <ProductRankingTable coverage={products.data!.coverage} rows={products.data!.rows} />
          )}
        </Box>
      </Paper>
    </Stack>
  );
}
