"use client";

import { createContext, useContext } from "react";
import type { AppRole } from "@/lib/auth";

export const AppRoleContext = createContext<AppRole | null>(null);

export function useAppRole() {
  return useContext(AppRoleContext);
}
