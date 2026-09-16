import type { EmployeeRankingRow } from '@bazols/contracts';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

function money(value: string, currency: string) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(Number(value));
}

export function EmployeeRankingTable({ rows }: { rows: EmployeeRankingRow[] }) {
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table aria-label="Рейтинг сотрудников" sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>Место</TableCell>
            <TableCell>Сотрудник</TableCell>
            <TableCell align="right">Выручка</TableCell>
            <TableCell align="right">Заказы</TableCell>
            <TableCell align="right">Средний чек</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.employeeId} hover>
              <TableCell>{row.rank}</TableCell>
              <TableCell component="th" scope="row" sx={{ fontWeight: 650 }}>
                {row.name}
              </TableCell>
              <TableCell align="right">{money(row.revenue, row.currency)}</TableCell>
              <TableCell align="right">{row.ordersCount}</TableCell>
              <TableCell align="right">{money(row.averageCheque, row.currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
