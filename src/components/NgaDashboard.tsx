import { chromium, Page } from 'playwright';
import { NgaRecord, TestState } from '../store/dashboardStore';

interface ScrapingProgressCallback {
  (currentOperation: string, rowsProcessed: number, status: 'running' | 'completed' | 'failed'): void;
}

export async function scrapeNgaData(
  suiteName: string,
  onProgress: ScrapingProgressCallback
): Promise<NgaRecord[]> {
  const ngaUrl = 'https://nga.intel.com'; // Example Base NGA Domain
  const targetSubpage = '/DMR_PV/LabAutomation/TestRunsComposite';
  
  onProgress('Launching Chromium instance...', 0, 'running');
  const browser = await chromium.launch({ headless: false }); // Launched headfully to support manual Intel SSO
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    onProgress('Navigating to NGA Platform...', 0, 'running');
    await page.goto(`${ngaUrl}${targetSubpage}`, { waitUntil: 'load', timeout: 60000 });

    // Handle SSO Authentication Check
    if (page.url().includes('login') || (await page.locator('input[type="email"], input[name="loginfmt"]').count()) > 0) {
      onProgress('Intel SSO detected. Please enter your credentials in the browser window directly...', 0, 'running');
      // Wait for navigation past the login portal (max 3 mins)
      await page.waitForURL((url) => url.toString().includes(targetSubpage), { timeout: 180000 });
    }

    onProgress('Applying Suite and Latest Test filters...', 0, 'running');

    // 1. Add Filter Criteria 1: TestLine In [SuiteName]
    await page.click('button:has-text("Add filter"), .add-filter-btn');
    await page.fill('.filter-field-input', 'TestLine');
    await page.selectOption('.filter-operator-select', 'In');
    await page.fill('.filter-value-input', suiteName);
    await page.click('button:has-text("Apply filter")');

    // 2. Add Filter Criteria 2: TestRun IsLatestRun = true
    await page.click('button:has-text("Add filter"), .add-filter-btn');
    await page.fill('.filter-field-input', 'TestRun');
    await page.selectOption('.filter-operator-select', 'Equal');
    await page.fill('.filter-value-input', 'true');
    await page.click('button:has-text("Apply filter")');

    // Apply main Search Command
    onProgress('Executing filter search queries...', 0, 'running');
    await page.click('button:has-text("Search"), .search-submit-btn');

    // Wait for the grid to load data
    onProgress('Waiting for NGA results page to load...', 0, 'running');
    await page.waitForSelector('.nga-grid-row, [role="row"]', { state: 'visible', timeout: 30000 });

    const collectedRecords = new Map<string, NgaRecord>();
    let previousRowCount = 0;
    let infiniteScrollActive = true;
    let sameCountRetries = 0;

    onProgress('Beginning infinite scroll aggregation...', 0, 'running');

    // Extract records interactively using dynamic page scrolling
    while (infiniteScrollActive) {
      // Evaluate actual records visible in virtual table viewport
      const currentBatch = await page.evaluate(() => {
        const rows = document.querySelectorAll('.nga-grid-row, [role="row"]');
        const chunk: { testId: string; testName: string; domain: string; state: string; bucket: string }[] = [];

        rows.forEach((row) => {
          // Map class names according to actual NGA UI structures
          const testIdEl = row.querySelector('.col-id, [data-field="testId"]');
          const testNameEl = row.querySelector('.col-name, [data-field="testName"]');
          const domainEl = row.querySelector('.col-group, .col-domain, [data-field="validationGroup"]');
          const stateEl = row.querySelector('.col-state, [data-field="state"]');
          const bucketEl = row.querySelector('.col-bucket, [data-field="bucket"]');

          if (testIdEl && testNameEl) {
            chunk.push({
              testId: testIdEl.textContent?.trim() || '',
              testName: testNameEl.textContent?.trim() || '',
              domain: domainEl?.textContent?.trim() || 'Unknown Domain',
              state: stateEl?.textContent?.trim() || 'Pending Running',
              bucket: bucketEl?.textContent?.trim() || ''
            });
          }
        });
        return chunk;
      });

      // Stream to our local unique dictionary
      currentBatch.forEach(item => {
        if (item.testId) {
          collectedRecords.set(item.testId, {
            testId: item.testId,
            testName: item.testName,
            domain: item.domain,
            state: mapStringToTestState(item.state),
            bucket: item.bucket
          });
        }
      });

      onProgress(`Scrolling grid viewport (Records loaded: ${collectedRecords.size})...`, collectedRecords.size, 'running');

      // Execute Scroll Down inside NGA Grid container to force lazy loading hook
      await page.evaluate(() => {
        const gridBody = document.querySelector('.nga-grid-viewport, .grid-container, body');
        if (gridBody) {
          gridBody.scrollTop = gridBody.scrollHeight;
        }
      });

      await page.waitForTimeout(800); // Wait for API response fetch thread

      const currentSize = collectedRecords.size;
      if (currentSize === previousRowCount) {
        sameCountRetries++;
        if (sameCountRetries >= 5) {
          // If height does not alter after 5 sequential scrolling events, we have fetched all items
          infiniteScrollActive = false;
        }
      } else {
        sameCountRetries = 0;
      }
      previousRowCount = currentSize;
    }

    onProgress('Clean completed! Finalizing data objects...', collectedRecords.size, 'completed');
    await browser.close();
    return Array.from(collectedRecords.values());

  } catch (err: any) {
    onProgress(`Scraping interrupted: ${err.message}`, 0, 'failed');
    await browser.close();
    throw err;
  }
}

function mapStringToTestState(stateStr: string): TestState {
  const norm = stateStr.toLowerCase().replace(/[\s_-]/g, '');
  if (norm.includes('pass')) return 'Passed';
  if (norm.includes('fail')) return 'Failed';
  if (norm.includes('pendingrunning') || norm.includes('pendingrun')) return 'Pending Running';
  if (norm.includes('pendinggatekeeper') || norm.includes('gatekeeper')) return 'Pending Gatekeeper';
  if (norm.includes('running')) return 'Running';
  if (norm.includes('error')) return 'Error';
  if (norm.includes('abort')) return 'Aborted';
  if (norm.includes('cancel')) return 'Cancelled';
  if (norm.includes('applicable') || norm.includes('na')) return 'Not Applicable';
  return 'Pending Running';
}