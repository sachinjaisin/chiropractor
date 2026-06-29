import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { logger } from '../config/logger';

export class StorageService {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.s3 = new S3Client({
      region:   env.AWS_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
    this.bucket = env.S3_BUCKET_DOCUMENTS;
  }

  async uploadDocument(
    practitionerId: string,
    documentType:   string,
    filename:       string,
    mimeType:       string,
    buffer:         Buffer,
  ): Promise<string> {
    const ext    = filename.split('.').pop() ?? 'bin';
    const s3Key  = `practitioners/${practitionerId}/${documentType.toLowerCase()}/${crypto.randomUUID()}.${ext}`;

    try {
      await this.s3.send(new PutObjectCommand({
        Bucket:               this.bucket,
        Key:                  s3Key,
        Body:                 buffer,
        ContentType:          mimeType,
        ServerSideEncryption: 'aws:kms',
        Metadata: {
          practitioner_id: practitionerId,
          document_type:   documentType,
          original_name:   encodeURIComponent(filename),
        },
      }));
    } catch (err) {
      logger.warn({ err, s3Key }, 'S3 upload failed, falling back to local file storage');
      try {
        const localPath = path.join(process.cwd(), 'uploads', s3Key);
        await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
        await fs.promises.writeFile(localPath, buffer);
      } catch (fsErr) {
        logger.error({ err: fsErr }, 'Local file fallback failed');
        throw err;
      }
    }

    return s3Key;
  }

  async getSignedDownloadUrl(s3Key: string, expiresInSeconds = 900): Promise<string> {
    const localPath = path.join(process.cwd(), 'uploads', s3Key);
    if (fs.existsSync(localPath)) {
      return `${env.APP_URL}/uploads/${s3Key}`;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key:    s3Key,
      });
      return await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
    } catch (err) {
      logger.warn({ err, s3Key }, 'Failed to generate signed S3 URL, returning local fallback link');
      return `${env.APP_URL}/uploads/${s3Key}`;
    }
  }

  async deleteDocument(s3Key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key:    s3Key,
      }));
    } catch (err) {
      logger.warn({ err, s3Key }, 'S3 delete failed');
    }

    try {
      const localPath = path.join(process.cwd(), 'uploads', s3Key);
      if (fs.existsSync(localPath)) {
        await fs.promises.unlink(localPath);
      }
    } catch (err) {
      logger.warn({ err, s3Key }, 'Failed to delete local file');
    }
  }
}
