/** BullMQ queue that carries document-indexing jobs to the worker process. */
export const DOCUMENT_QUEUE = 'index-document';

/** Payload for an `index-document` job. */
export interface IndexDocumentJob {
  orgId: string;
  documentId: string;
}
