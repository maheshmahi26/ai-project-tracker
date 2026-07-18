import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DOCUMENT_QUEUE, type IndexDocumentJob } from '../documents.constants';
import { DocumentIndexer } from './document-indexer.service';

/**
 * Consumes the `index-document` queue in the worker process. Delegates to
 * {@link DocumentIndexer}; BullMQ handles retries/backoff (configured by the
 * producer) when the indexer rethrows on a transient failure.
 */
@Processor(DOCUMENT_QUEUE)
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(private readonly indexer: DocumentIndexer) {
    super();
  }

  async process(job: Job<IndexDocumentJob>): Promise<void> {
    const { orgId, documentId } = job.data;
    this.logger.log(`Processing index-document job for ${documentId} (attempt ${job.attemptsMade + 1})`);
    await this.indexer.index(orgId, documentId);
  }
}
