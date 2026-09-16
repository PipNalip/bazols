import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type { RestaurantOption } from './api.js';

type ReportToolbarProps = {
  restaurants: RestaurantOption[];
  restaurantId: string;
  from: string;
  to: string;
  onRestaurantChange: (id: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

export function ReportToolbar(props: ReportToolbarProps) {
  const restaurant = props.restaurants.find((item) => item.id === props.restaurantId);
  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', p: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'end' } }}>
        <FormControl sx={{ minWidth: 240 }}>
          <InputLabel id="restaurant-label">Ресторан</InputLabel>
          <Select
            label="Ресторан"
            labelId="restaurant-label"
            onChange={(event) => props.onRestaurantChange(event.target.value)}
            value={props.restaurantId}
          >
            {props.restaurants.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.displayName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Дата начала"
          onChange={(event) => props.onFromChange(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          type="date"
          value={props.from}
        />
        <TextField
          label="Дата окончания"
          onChange={(event) => props.onToChange(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          type="date"
          value={props.to}
        />
        <Box sx={{ ml: { md: 'auto' }, minWidth: 240 }}>
          <Typography variant="body2" color="text.secondary">
            Последняя успешная синхронизация:{' '}
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 650 }}>
              {restaurant?.lastSuccessfulSyncAt
                ? new Date(restaurant.lastSuccessfulSyncAt).toLocaleString('ru-RU')
                : 'Данных ещё нет'}
            </Box>
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
