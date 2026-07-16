/**
 * StorageService — the object-storage port (hexagonal boundary).
 *
 * The application depends only on this abstract contract, never on a concrete
 * SDK. In dev/prod it is bound to the S3-compatible adapter (MinIO locally,
 * Cloudflare R2 / AWS S3 in prod); in tests it is faked. This keeps FilesService
 * free of vendor lock-in and trivially unit-testable.
 */
export interface PresignUploadInput {
  key: string;
  contentType: string;
  /** Optional cap enforced by the storage provider on the presigned PUT. */
  maxSizeBytes?: number;
}

export interface PresignDownloadInput {
  key: string;
  /** Suggested download filename (Content-Disposition). */
  fileName?: string;
}

export abstract class StorageService {
  /** Returns a short-lived presigned PUT URL the client uploads the bytes to. */
  abstract presignUpload(input: PresignUploadInput): Promise<string>;
  /** Returns a short-lived presigned GET URL for private object download. */
  abstract presignDownload(input: PresignDownloadInput): Promise<string>;
  /** Best-effort object deletion (never throws into the request path). */
  abstract deleteObject(key: string): Promise<void>;
  /** Seconds a presigned URL stays valid. */
  abstract readonly urlTtlSec: number;
}
