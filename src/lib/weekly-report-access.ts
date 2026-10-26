import { NextResponse } from "next/server";
import { getRequestSession } from "./auth";
import { getDashboardSettings } from "./dashboard-settings";
import type { AppRole } from "./auth";
import type { DashboardSettings } from "./dashboard-settings";

export type ViewerWeeklyReportFeature = "weeklyReportUpdate" | "weeklyReportEmail";
type WeeklyReportFeatureSettings = Pick<DashboardSettings, ViewerWeeklyReportFeature>;

export function canAccessWeeklyReportFeature(role: AppRole, feature: ViewerWeeklyReportFeature, settings: WeeklyReportFeatureSettings) {
  return role === "admin" || settings[feature];
}

export async function authorizeWeeklyReportFeature(req: Request, feature: ViewerWeeklyReportFeature) {
  const session = await getRequestSession(req);
  if (!session) return NextResponse.json({ error: "Please sign in to use this app." }, { status: 401 });
  try {
    const settings = await getDashboardSettings();
    if (canAccessWeeklyReportFeature(session.role, feature, settings)) return null;
  } catch {
    return NextResponse.json({ error: "Could not load feature access settings." }, { status: 503 });
  }
  return NextResponse.json({ error: "This Weekly Report feature is not enabled for viewer accounts." }, { status: 403 });
}