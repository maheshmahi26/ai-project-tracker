import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfigService } from '../../../config/config.module';
import {
  StorageService,
  type PresignDownloadInput,
  type PresignUploadInput,
} from './storage.service';

/**
 * S3-compatible storage adapter. Works against MinIO in dev (path-style,
 * custom endpoint) and Cloudflare R2 / AWS S3 in prod. Buckets are private;
 * clients receive short-lived presigned URLs for both upload and download so
 * the API never proxies file bytes.
 */
@Injectable()
export class S3StorageService extends StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  readonly urlTtlSec = 15 * 60; // 15 minutes

  constructor(private readonly config: AppConfigService) {
    super();
    this.bucket = this.config.get('STORAGE_BUCKET');
    const accessKeyId = this.config.get('STORAGE_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get('STORAGE_SECRET_ACCESS_KEY');
    this.client = new S3Client({
      region: this.config.get('STORAGE_REGION'),
      endpoint: this.config.get('STORAGE_ENDPOINT') || undefined,
      forcePathStyle: this.config.get('STORAGE_FORCE_PATH_STYLE'),
      credentials:
        accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }

  async presignUpload(input: PresignUploadInput): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: this.urlTtlSec });
  }

  async presignDownload(input: PresignDownloadInput): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentDisposition: input.fileName
        ? `attachment; filename="${encodeURIComponent(input.fileName)}"`
        : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: this.urlTtlSec });
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Object ${key} has no body`);
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      // Object cleanup is best-effort; a leaked object must never fail the request.
      this.logger.warn(`Failed to delete object ${key}: ${(err as Error).message}`);
    }
  }
}
