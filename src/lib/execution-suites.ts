export const B0_SUITES = {
  P1: "Oak_Stream_Platform_1_DMR-Platform_PC-PAIV-Platform-AP1_B0_P1_Tests_Cycle",
  P2: "Oak_Stream_Platform_1_DMR-Platform_PC-PAIV-Platform-AP1_B0_P2_Tests_Cycle",
} as const;

export const B2_SUITES = {
  P1: "Oak_Stream_Platform_1_DMR-Platform_PC-PAIV-Platform-AP1_B2_P1_Tests_Cycle",
  P2: "Oak_Stream_Platform_1_DMR-Platform_PC-PAIV-Platform-AP1_B2_P2_Tests_Cycle",
} as const;

export type ExecutionProfile = "b0" | "b2";

export function isSuiteSelectedForProfile(suite: string, selectedSuites: string[], profile: ExecutionProfile): boolean {
  const suiteKey = suite.trim().toLowerCase();
  if (selectedSuites.some((selected) => selected.trim().toLowerCase() === suiteKey)) return true;
  return profile === "b2" && /_b2_tests_cycle$/i.test(suite) &&
    selectedSuites.some((selected) => /_b2_p[12]_tests_cycle$/i.test(selected));
}