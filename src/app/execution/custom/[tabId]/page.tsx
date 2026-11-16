import { notFound } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { getCustomExecutionTab } from "@/lib/execution-tabs";

export const dynamic = "force-dynamic";

export default async function CustomExecutionPage({ params }: { params: Promise<{ tabId: string }> }) {
  const { tabId } = await params;
  const tab = await getCustomExecutionTab(tabId);
  if (!tab) notFound();
  return <Dashboard key={tab.id} customTab={tab} />;
}