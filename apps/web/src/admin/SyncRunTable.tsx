import {
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';

import type { RestaurantOption } from '../reports/api.js';
import type { SyncRun } from './api.js';

const statusLabels: Record<SyncRun['status'], string> = {
  QUEUED: 'В очереди',
  RUNNING: 'Выполняется',
  SUCCEEDED: 'Завершена',
  FAILED: 'Ошибка',
};

export function SyncRunTable({ runs, restaurants }: { runs: SyncRun[]; restaurants: RestaurantOption[] }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label="Журнал синхронизаций">
        <TableHead>
          <TableRow>
            <TableCell>Ресторан</TableCell>
            <TableCell>Период</TableCell>
            <TableCell>Статус</TableCell>
            <TableCell>Результат</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>{restaurants.find((item) => item.id === run.restaurantId)?.displayName ?? run.restaurantId}</TableCell>
              <TableCell>{run.beginDate} — {run.endDate}</TableCell>
              <TableCell><Chip size="small" label={statusLabels[run.status]} color={run.status === 'FAILED' ? 'error' : run.status === 'SUCCEEDED' ? 'success' : 'default'} /></TableCell>
              <TableCell>{run.safeErrorCode ?? `${run.employeesCount} сотрудников, ${run.productsCount} товаров`}</TableCell>
            </TableRow>
          ))}
          {runs.length === 0 ? <TableRow><TableCell colSpan={4}>Запусков пока нет.</TableCell></TableRow> : null}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
