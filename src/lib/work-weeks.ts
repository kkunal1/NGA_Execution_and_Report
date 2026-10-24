const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const IST_OFFSET_MS = 330 * 60_000;

export function getISTDateKey(date = new Date()) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function getISTDayRange(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new TypeError("Select a valid report date.");
  const day = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== dateKey) {
    throw new TypeError("Select a valid report date.");
  }
  const from = new Date(day.getTime() - IST_OFFSET_MS);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

export function getDailyReportLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) {
    throw new TypeError("Select a valid report date.");
  }
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay() || 7;
  return `${getIsoWorkWeekLabel(date)}.${day}`;
}

function mondayOf(day: number) {
  return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;
}

export function getIsoWorkWeekLabel(date: Date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const thursday = day + (3 - ((new Date(day).getUTCDay() + 6) % 7)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const firstMonday = mondayOf(Date.UTC(year, 0, 4));
  const week = Math.floor((mondayOf(day) - firstMonday) / WEEK_MS) + 1;
  return `WW${String(week).padStart(2, "0")}`;
}

export function getWorkWeeks(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const currentMonday = mondayOf(today);
  const year = new Date(currentMonday + 3 * DAY_MS).getUTCFullYear();
  const firstMonday = mondayOf(Date.UTC(year, 0, 4));
  const currentWeek = Math.floor((currentMonday - firstMonday) / WEEK_MS) + 1;

  return {
    year,
    weeks: Array.from({ length: currentWeek }, (_, index) => {
      const number = currentWeek - index;
      const monday = firstMonday + (number - 1) * WEEK_MS;
      return {
        label: `WW${String(number).padStart(2, "0")}`,
        from: new Date(monday - IST_OFFSET_MS),
        to: new Date(Math.min(monday + WEEK_MS - IST_OFFSET_MS, now.getTime())),
      };
    }),
  };
}