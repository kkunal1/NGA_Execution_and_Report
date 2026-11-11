"use client";

import { useState } from "react";
import PoolSystemsDownload from "@/components/PoolSystemsDownload";
import PoolSystemsTable from "@/components/PoolSystemsTable";
import UncoveredConfigsTable from "@/components/UncoveredConfigsTable";

export default function PoolSystemsPage() {
  const [selectedPoolNames, setSelectedPoolNames] = useState<string[]>([]);
  return (
    <div className="mx-auto max-w-7xl">
      <PoolSystemsDownload poolNames={selectedPoolNames} />
      <PoolSystemsTable onSelectedPoolNamesChange={setSelectedPoolNames} />
      <UncoveredConfigsTable />
    </div>
  );
}