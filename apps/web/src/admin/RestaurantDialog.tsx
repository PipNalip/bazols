import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';

import type { SourceUnit } from './api.js';

export type RestaurantMapping = {
  displayName: string;
  sourceUnitId: string;
  sourceRole: string;
  timezone: string;
};

export function RestaurantDialog({
  open,
  units,
  onClose,
  onSubmit,
}: {
  open: boolean;
  units: SourceUnit[];
  onClose: () => void;
  onSubmit: (mapping: RestaurantMapping) => void | Promise<void>;
}) {
  const [displayName, setDisplayName] = useState('');
  const [sourceUnitId, setSourceUnitId] = useState('');
  const [sourceRole, setSourceRole] = useState('');
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const selectedUnit = useMemo(() => units.find((unit) => unit.id === sourceUnitId), [sourceUnitId, units]);

  useEffect(() => {
    if (!open || !units[0]) return;
    setSourceUnitId(units[0].id);
    setSourceRole(units[0].roles[0] ?? '');
  }, [open, units]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Добавить ресторан</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Название ресторана" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <FormControl>
            <InputLabel id="source-unit-label">Подразделение источника</InputLabel>
            <Select labelId="source-unit-label" label="Подразделение источника" value={sourceUnitId} onChange={(event) => {
              const unit = units.find((item) => item.id === event.target.value);
              setSourceUnitId(event.target.value);
              setSourceRole(unit?.roles[0] ?? '');
            }}>
              {units.map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl>
            <InputLabel id="source-role-label">Роль источника</InputLabel>
            <Select labelId="source-role-label" label="Роль источника" value={sourceRole} onChange={(event) => setSourceRole(event.target.value)}>
              {(selectedUnit?.roles ?? []).map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Часовой пояс" value={timezone} onChange={(event) => setTimezone(event.target.value)} helperText="IANA, например Europe/Moscow" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" disabled={!displayName.trim() || !sourceUnitId || !sourceRole || !timezone.trim()} onClick={() => void onSubmit({ displayName: displayName.trim(), sourceUnitId, sourceRole, timezone: timezone.trim() })}>Сохранить ресторан</Button>
      </DialogActions>
    </Dialog>
  );
}
