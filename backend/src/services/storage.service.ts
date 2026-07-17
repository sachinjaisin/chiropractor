import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { env } from '../config/env';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { logger } from '../config/logger';

export class StorageService {
  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key:    env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadDocument(
    practitionerId: string,
    documentType:   string,
    filename:       string,
    mimeType:       string,
    buffer:         Buffer,
  ): Promise<string> {
    const resourceType = mimeType.startsWith('image/') ? 'image' : 'raw';
    const ext = filename.split('.').pop() ?? 'bin';
    const uuid = crypto.randomUUID();
    const publicId = resourceType === 'raw'
      ? `practitioners/${practitionerId}/${documentType.toLowerCase()}/${uuid}.${ext}`
      : `practitioners/${practitionerId}/${documentType.toLowerCase()}/${uuid}`;

    const s3Key = `${resourceType}:${publicId}`;

    try {
      await new Promise((resolve, reject) => {
        const writeStream = cloudinary.uploader.upload_stream(
          {
            public_id:     publicId,
            resource_type: resourceType,
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        const readStream = new Readable();
        readStream.push(buffer);
        readStream.push(null);
        readStream.pipe(writeStream);
      });
    } catch (err) {
      logger.warn({ err, s3Key }, 'Cloudinary upload failed, falling back to local file storage');
      try {
        const localPath = path.join(process.cwd(), 'uploads', s3Key.replace(':', '_'));
        await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
        await fs.promises.writeFile(localPath, buffer);
      } catch (fsErr) {
        logger.error({ err: fsErr }, 'Local file fallback failed');
        throw err;
      }
    }

    return s3Key;
  }

  async getSignedDownloadUrl(s3Key: string, _expiresInSeconds = 900): Promise<string> {
    const localKey = s3Key.replace(':', '_');
    const localPath = path.join(process.cwd(), 'uploads', localKey);
    if (fs.existsSync(localPath)) {
      return `${env.APP_URL}/uploads/${localKey}`;
    }

    try {
      const parts = s3Key.split(':');
      const resourceType = parts[0];
      const publicId = parts.slice(1).join(':');
      return cloudinary.url(publicId, {
        secure: true,
        resource_type: resourceType as any,
      });
    } catch (err) {
      logger.warn({ err, s3Key }, 'Failed to generate Cloudinary URL, returning local fallback link');
      return `${env.APP_URL}/uploads/${localKey}`;
    }
  }

  async deleteDocument(s3Key: string): Promise<void> {
    try {
      const parts = s3Key.split(':');
      const resourceType = parts[0];
      const publicId = parts.slice(1).join(':');
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType as any,
      });
    } catch (err) {
      logger.warn({ err, s3Key }, 'Cloudinary delete failed');
    }

    try {
      const localKey = s3Key.replace(':', '_');
      const localPath = path.join(process.cwd(), 'uploads', localKey);
      if (fs.existsSync(localPath)) {
        await fs.promises.unlink(localPath);
      }
    } catch (err) {
      logger.warn({ err, s3Key }, 'Failed to delete local file');
    }
  }
}
