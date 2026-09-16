import { z } from 'zod';

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximumDay = daysInMonth[month - 1];
  return maximumDay !== undefined && day >= 1 && day <= maximumDay;
}

const isoDate = z.string().refine(isCalendarDate, { message: 'Invalid calendar date' });

export const employeeReportQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    sort: z.enum(['revenue', 'ordersCount', 'averageCheque']),
  })
  .refine((value) => value.from <= value.to);

export const productReportQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    sort: z.enum(['unitsSold', 'revenue']),
  })
  .refine((value) => value.from <= value.to);
