import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TestState = 
  | 'Passed' | 'Failed' | 'Pending Running' | 'Pending Gatekeeper' 
  | 'Running' | 'Error' | 'Aborted' | 'Cancelled' | 'Not Applicable';

export interface NgaRecord {
  testId: string;
  testName: string;
  domain: string; // From Validation Group Name
  state: TestState;
  bucket: string;
}

export interface DomainStats {
  domain: string;
  total: number;
  passed: number;
  failed: number;
  pendingRunning: number;
  pendingGatekeeper: number;
  running: number;
  error: number;
  aborted: number;
  cancelled: number;
  notApplicable: number;
  passPercentage: number;
  failPercentage: number;
  buckets: { bucketName: string; count: number }[];
}

export interface AuditLogEntry {
  startTime: string;
  endTime: string;
  totalRowsProcessed: number;
  suiteName: string;
  status: 'Success' | 'Failed';
  errorLog?: string;
}

interface DashboardState {
  suiteName: string;
  setSuiteName: (name: string) => void;
  rawRecords: NgaRecord[];
  domainSummary: DomainStats[];
  auditLogs: AuditLogEntry[];
  isCollecting: boolean;
  progress: {
    currentOperation: string;
    rowsProcessed: number;
    status: 'idle' | 'running' | 'completed' | 'failed';
    elapsedTime: number; // in seconds
  };
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  startCollection: () => void;
  updateProgress: (op: string, processed: number, status: 'idle' | 'running' | 'completed' | 'failed') => void;
  tickElapsed: () => void;
  setCollectionResults: (records: NgaRecord[], summaries: DomainStats[], log: AuditLogEntry) => void;
  clearCollection: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      suiteName: 'Oak_Stream_Platform_1_DMR-Platform_Beta-PAIV-Platform-AP1_Beta_Regression_Cycle',
      setSuiteName: (name) => set({ suiteName: name }),
      rawRecords: [],
      domainSummary: [],
      auditLogs: [],
      isCollecting: false,
      progress: {
        currentOperation: 'Waiting to start...',
        rowsProcessed: 0,
        status: 'idle',
        elapsedTime: 0
      },
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      startCollection: () => set((state) => ({
        isCollecting: true,
        progress: {
          currentOperation: 'Initializing Browser & Navigating to NGA...',
          rowsProcessed: 0,
          status: 'running',
          elapsedTime: 0
        }
      })),
      updateProgress: (op, processed, status) => set((state) => ({
        progress: {
          ...state.progress,
          currentOperation: op,
          rowsProcessed: processed,
          status
        }
      })),
      tickElapsed: () => set((state) => ({
        progress: {
          ...state.progress,
          elapsedTime: state.progress.elapsedTime + 1
        }
      })),
      setCollectionResults: (records, summaries, log) => set((state) => ({
        rawRecords: records,
        domainSummary: summaries,
        isCollecting: false,
        progress: {
          currentOperation: 'Data collection completed successfully.',
          rowsProcessed: records.length,
          status: 'completed',
          elapsedTime: state.progress.elapsedTime
        },
        auditLogs: [log, ...state.auditLogs]
      })),
      clearCollection: () => set({
        rawRecords: [],
        domainSummary: [],
        progress: {
          currentOperation: 'Waiting to start...',
          rowsProcessed: 0,
          status: 'idle',
          elapsedTime: 0
        }
      })
    }),
    {
      name: 'nga-dashboard-storage',
      partialize: (state) => ({ 
        suiteName: state.suiteName, 
        theme: state.theme,
        auditLogs: state.auditLogs 
      })
    }
  )
);