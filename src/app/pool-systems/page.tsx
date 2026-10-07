import PoolSystemsDownload from "@/components/PoolSystemsDownload";
import PoolSystemsTable from "@/components/PoolSystemsTable";
import UncoveredConfigsTable from "@/components/UncoveredConfigsTable";

export default function PoolSystemsPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <PoolSystemsDownload />
      <PoolSystemsTable />
      <UncoveredConfigsTable />
    </div>
  );
}