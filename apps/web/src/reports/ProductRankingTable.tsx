import type { ProductRankingRow } from '@bazols/contracts';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

function money(value: string, currency: string) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(Number(value));
}

export function ProductRankingTable({ rows }: { rows: ProductRankingRow[] }) {
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table aria-label="Рейтинг товаров" sx={{ minWidth: 620 }}>
        <TableHead>
          <TableRow>
            <TableCell>Место</TableCell>
            <TableCell>Товар</TableCell>
            <TableCell align="right">Продано</TableCell>
            <TableCell align="right">Выручка</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.productId} hover>
              <TableCell>{row.rank}</TableCell>
              <TableCell component="th" scope="row" sx={{ fontWeight: 650 }}>
                {row.name}
              </TableCell>
              <TableCell align="right">{row.unitsSold}</TableCell>
              <TableCell align="right">{money(row.revenue, row.currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
