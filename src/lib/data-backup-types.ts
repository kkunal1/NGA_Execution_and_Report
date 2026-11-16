export const DATA_BACKUP_CATEGORIES = {
  execution: "Execution snapshots and history",
  weeklyReports: "Weekly Report history and settings",
  appSettings: "Dashboard, pool, theme, and refresh settings",
} as const;

export type DataBackupCategory = keyof typeof DATA_BACKUP_CATEGORIES;
export const DATA_BACKUP_CATEGORY_KEYS = Object.keys(DATA_BACKUP_CATEGORIES) as DataBackupCategory[];