const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const IST_OFFSET_MS = 330 * 60_000;

function mondayOf(day: number) {
  return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;
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