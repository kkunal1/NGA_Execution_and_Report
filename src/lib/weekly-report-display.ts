export const DEFAULT_CPU_ALLOCATION_TITLE = "DMR System Allocation Across Teams";

const LEGACY_CPU_ALLOCATION_TITLES = new Set([
  "DMR CPU Allocation Across Teams",
  "DMR X1 and X4 CPU breakdown",
]);

export function displayCpuAllocationTitle(value: string | null | undefined) {
  const title = value?.trim();
  if (!title || LEGACY_CPU_ALLOCATION_TITLES.has(title)) return DEFAULT_CPU_ALLOCATION_TITLE;
  return title;
}