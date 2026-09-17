import type { ProductRankingResponse, ProductRankingRow } from '@bazols/contracts';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

function money(value: string, currency: string) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(Number(value));
}

function optionalMoney(value: string | null, currency: string) {
  return value === null ? 'Нет данных' : money(value, currency);
}

function marginRate(value: string | null) {
  return value === null
    ? 'Нет данных'
    : `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} %`;
}

export function ProductRankingTable({ rows, coverage }: { rows: ProductRankingRow[]; coverage: ProductRankingResponse['coverage'] }) {
  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 1.5 }} variant="body2">
        Покрытие себестоимостью: {coverage.costedUnits} из {coverage.totalUnits} ед. ({marginRate(coverage.percentage)})
      </Typography>
      <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
      <Table aria-label="Рейтинг товаров" sx={{ minWidth: 940, '& th, & td': { whiteSpace: 'nowrap' } }}>
        <TableHead>
          <TableRow>
            <TableCell>Место</TableCell>
            <TableCell>Товар</TableCell>
            <TableCell align="right">Продано</TableCell>
            <TableCell align="right">Выручка</TableCell>
            <TableCell align="right">Себестоимость</TableCell>
            <TableCell align="right">Валовая маржа</TableCell>
            <TableCell align="right">Маржа %</TableCell>
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
              <TableCell align="right">{optionalMoney(row.cogs, row.currency)}</TableCell>
              <TableCell align="right">{optionalMoney(row.grossMargin, row.currency)}</TableCell>
              <TableCell align="right">{marginRate(row.grossMarginRate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </TableContainer>
    </Box>
  );
}
