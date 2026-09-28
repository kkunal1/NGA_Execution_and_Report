"use client";

import { createContext, useContext } from "react";

export type RefreshSchedule = { nextRefreshAt: number | null; intervalSeconds: number };
export type RefreshScheduleContextValue = {
  schedule: RefreshSchedule;
  setSchedule: (schedule: RefreshSchedule) => void;
};

export const RefreshScheduleContext = createContext<RefreshScheduleContextValue | null>(null);

export function useRefreshSchedule() {
  return useContext(RefreshScheduleContext);
}
