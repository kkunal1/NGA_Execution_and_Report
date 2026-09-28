import { NgaRecord, DomainStats, TestState } from '../store/dashboardStore';

export function calculateMetrics(records: NgaRecord[]): DomainStats[] {
  const domainsMap = new Map<string, NgaRecord[]>();

  // Deduplicate using Test ID
  const uniqueRecordsMap = new Map<string, NgaRecord>();
  records.forEach(record => {
    if (record.testId && !uniqueRecordsMap.has(record.testId)) {
      uniqueRecordsMap.set(record.testId, record);
    }
  });

  const uniqueRecords = Array.from(uniqueRecordsMap.values());

  // Group by Domain (Validation Group Name)
  uniqueRecords.forEach(record => {
    const domain = record.domain || 'Unknown Domain';
    if (!domainsMap.has(domain)) {
      domainsMap.set(domain, []);
    }
    domainsMap.get(domain)!.push(record);
  });

  const stats: DomainStats[] = [];

  domainsMap.forEach((domainRecords, domainName) => {
    const total = domainRecords.length;
    let passed = 0;
    let failed = 0;
    let pendingRunning = 0;
    let pendingGatekeeper = 0;
    let running = 0;
    let error = 0;
    let aborted = 0;
    let cancelled = 0;
    let notApplicable = 0;

    const bucketCounts: Record<string, number> = {};

    domainRecords.forEach(rec => {
      switch (rec.state) {
        case 'Passed': passed++; break;
        case 'Failed': failed++; break;
        case 'Pending Running': pendingRunning++; break;
        case 'Pending Gatekeeper': pendingGatekeeper++; break;
        case 'Running': running++; break;
        case 'Error': error++; break;
        case 'Aborted': aborted++; break;
        case 'Cancelled': cancelled++; break;
        case 'Not Applicable': notApplicable++; break;
      }

      if (rec.state === 'Failed' && rec.bucket) {
        const bucketVal = rec.bucket.trim() || 'Unassigned Bucket';
        bucketCounts[bucketVal] = (bucketCounts[bucketVal] || 0) + 1;
      }
    });

    const passPercentage = total > 0 ? parseFloat(((passed / total) * 100).toFixed(2)) : 0;
    const failPercentage = total > 0 ? parseFloat(((failed / total) * 100).toFixed(2)) : 0;

    // Convert buckets map to sorted statistics array (descending order)
    const buckets = Object.entries(bucketCounts)
      .map(([bucketName, count]) => ({ bucketName, count }))
      .sort((a, b) => b.count - a.count);

    stats.push({
      domain: domainName,
      total,
      passed,
      failed,
      pendingRunning,
      pendingGatekeeper,
      running,
      error,
      aborted,
      cancelled,
      notApplicable,
      passPercentage,
      failPercentage,
      buckets
    });
  });

  // Sort domains alphabetically
  return stats.sort((a, b) => a.domain.localeCompare(b.domain));
}
