import {
  SourceConnector,
  type CollectedReport,
  type CollectReportRequest,
} from '../source/source.connector.js';
import { ImportPageService, type RawImportPage } from './import-page.service.js';

export type SourceIngestionInput = CollectReportRequest & {
  syncRunId: string;
  restaurantId: string;
  timezone: string;
  markSucceeded?: boolean;
};

export class SourceIngestionService {
  constructor(
    private readonly connector: SourceConnector,
    private readonly importer: ImportPageService,
  ) {}

  async run(input: SourceIngestionInput): Promise<CollectedReport> {
    const pages: RawImportPage[] = [];
    const costPages: RawImportPage[] = [];
    const report = await this.connector.collectReport(input, async (rawPage) => {
      const page: RawImportPage = { ...rawPage, endpoint: 'employeeRating' };
      pages.push(page);
      await this.importer.storeRawPage(input, page);
    });
    await this.connector.collectCostHistory(input, async (rawPage) => {
      const page: RawImportPage = rawPage;
      costPages.push(page);
      await this.importer.storeRawPage(input, page);
    });

    await this.importer.importStoredRun({
      syncRunId: input.syncRunId,
      restaurantId: input.restaurantId,
      sourceUnitId: input.sourceUnitId,
      beginDate: input.beginDate,
      endDate: input.endDate,
      timezone: input.timezone,
      pages,
      costPages,
      ...(input.markSucceeded ? { markSucceeded: true } : {}),
    });
    return report;
  }
}
