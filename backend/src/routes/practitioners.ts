import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PractitionerService } from '../services/practitioner.service';
import { StorageService } from '../services/storage.service';

const SEC = [{ bearerAuth: [] }];
const TAGS = ['Practitioners'];
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/x-png', 'image/webp'];
const ALLOWED_DOC_TYPES  = ['LICENSE', 'INSURANCE', 'CERTIFICATION', 'TRAINING', 'SUPPORTING'];

const practitionerRoutes: FastifyPluginAsync = async (fastify) => {
  const svc     = new PractitionerService();
  const storage = new StorageService();

  // GET /v1/practitioners/me/profile
  fastify.get('/me/profile', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Get own profile',
      description: 'Returns the authenticated practitioner\'s full profile including status, specialties, and service area.',
      response: {
        200: {
          description: 'Profile data',
          '$ref': 'PractitionerProfile#',
        },
        401: { '$ref': 'Error#' },
        404: { '$ref': 'Error#' },
      },
    },
  }, async (req) => svc.getOwnProfile(req.currentUser.sub));

  // PUT /v1/practitioners/me/profile
  fastify.put('/me/profile', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Update profile',
      description: 'Updates practice information, coverage area, and specialties. Triggers geocoding if address fields change.',
      body: {
        type: 'object',
        properties: {
          practice_name:     { type: 'string', minLength: 1, maxLength: 200 },
          practice_phone:    { type: 'string', nullable: true },
          practice_email:    { type: 'string', nullable: true },
          website:           { type: 'string', nullable: true },
          street_address:    { type: 'string' },
          city:              { type: 'string' },
          state:             { type: 'string', minLength: 2, maxLength: 2 },
          zip_code:          { type: 'string' },
          bio:               { type: 'string', maxLength: 2000, nullable: true },
          years_experience:  { type: 'integer', minimum: 0, maximum: 60, nullable: true },
          languages_spoken:  { type: 'array', items: { type: 'string' } },
          service_radius_km: { type: 'number', minimum: 1, maximum: 500 },
          areas_served:      { type: 'array', items: { type: 'string' } },
          specialties: {
            type: 'array',
            items: { type: 'string', enum: ['Back Pain','Neck Pain','Headaches/Migraine','Pregnancy Care','Pediatrics','Tinnitus','Wellness Care','Other'] },
          },
          profile_pic_url:   { type: 'string', nullable: true },
        },
      },
      response: {
        200: { '$ref': 'PractitionerProfile#' },
        401: { '$ref': 'Error#' },
        422: { '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const body = z.object({
      practice_name:     z.string().min(1).max(200).optional(),
      practice_phone:    z.string().nullable().optional(),
      practice_email:    z.string().email().nullable().optional(),
      website:           z.string().url().nullable().optional().or(z.literal('')).or(z.null()),
      street_address:    z.string().min(1).optional(),
      city:              z.string().min(1).optional(),
      state:             z.string().min(2).max(2).optional(),
      zip_code:          z.string().min(5).max(10).optional(),
      bio:               z.string().max(2000).nullable().optional(),
      years_experience:  z.number().int().min(0).max(60).nullable().optional(),
      languages_spoken:  z.array(z.string()).optional(),
      service_radius_km: z.number().min(1).max(500).optional(),
      areas_served:      z.array(z.string()).optional(),
      specialties:       z.array(z.string()).optional(),
      profile_pic_url:   z.string().nullable().optional(),
    }).parse(req.body);
    return reply.send(await svc.updateProfile(req.currentUser.sub, body));
  });

  // GET /v1/practitioners/me/documents
  fastify.get('/me/documents', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary: 'List verification documents',
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { '$ref': 'Document#' } },
          },
        },
      },
    },
  }, async (req) => svc.listDocuments(req.currentUser.practitioner_id!));

  // POST /v1/practitioners/me/documents
  fastify.post('/me/documents', {
    validatorCompiler: () => () => true,
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Upload a verification document',
      description: 'Multipart upload. Allowed types: PDF, JPEG/JPG, PNG, WEBP. Max size: 10MB. Stored encrypted in S3. Pass document_type as either query string or form field.',
      consumes:    ['multipart/form-data'],
      querystring: {
        type: 'object',
        properties: {
          document_type: {
            type: 'string',
            enum: ['LICENSE','INSURANCE','CERTIFICATION','TRAINING','SUPPORTING'],
          },
        },
      },
      body: {
        type: 'object',
        properties: {
          file: { type: 'string', format: 'binary', description: 'Document file (PDF/image)' },
          document_type: {
            type: 'string',
            enum: ['LICENSE','INSURANCE','CERTIFICATION','TRAINING','SUPPORTING'],
          },
        },
      },
      response: {
        201: { '$ref': 'Document#' },
        413: { description: 'File too large (max 10MB)', '$ref': 'Error#' },
        422: { description: 'Invalid file type or document_type', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ code: 'BAD_REQUEST', message: 'No file provided' });
    const query = req.query as Record<string, string>;
    const body  = req.body as Record<string, unknown>;
    const docType =
      (query['document_type'] as string) ||
      (body?.document_type as string) ||
      (data.fields?.document_type as any)?.value;
    if (!docType || !ALLOWED_DOC_TYPES.includes(docType)) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid document_type. Allowed values: LICENSE, INSURANCE, CERTIFICATION, TRAINING, SUPPORTING',
      });
    }
    if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid file type. Allowed: PDF, JPEG/JPG, PNG, WEBP',
      });
    }
    const buffer = await data.toBuffer();
    const s3Key  = await storage.uploadDocument(req.currentUser.practitioner_id!, docType, data.filename, data.mimetype, buffer);
    const doc    = await svc.saveDocument(req.currentUser.practitioner_id!, { document_type: docType, s3_key: s3Key, original_filename: data.filename, mime_type: data.mimetype, file_size_bytes: buffer.length });
    return reply.status(201).send(doc);
  });

  // GET /v1/practitioners/me/documents/:id/download
  fastify.get('/me/documents/:id/download', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Get a pre-signed download URL for a document',
      description: 'Returns a signed S3 URL valid for 15 minutes.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'object',
          properties: { url: { type: 'string', format: 'uri' } },
        },
        403: { '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ url: await svc.getDocumentDownloadUrl(req.currentUser.practitioner_id!, id) });
  });

  // DELETE /v1/practitioners/me/documents/:id
  fastify.delete('/me/documents/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Delete a document',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        204: { description: 'Deleted', type: 'null' },
        403: { '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await svc.deleteDocument(req.currentUser.practitioner_id!, id);
    return reply.status(204).send();
  });

  // GET /v1/practitioners/me/performance
  fastify.get('/me/performance', {
    preHandler: [fastify.authenticate, fastify.requireActive],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Get performance summary',
      description: 'Returns the latest quality score snapshot and lifetime referral stats.',
      response: {
        200: {
          type: 'object',
          properties: {
            quality_score: { '$ref': 'QualityScore#' },
            stats: {
              type: 'object',
              properties: {
                total:     { type: 'integer', description: 'Referrals visible to this practitioner' },
                claimed:   { type: 'integer' },
                completed: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (req) => svc.getPerformanceSummary(req.currentUser.practitioner_id!));

  // GET /v1/practitioners/me/feedback
  fastify.get('/me/feedback', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Get practitioner feedback',
      description: 'Returns patient feedback/reviews submitted for this practitioner.',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { '$ref': 'Feedback#' },
            },
          },
        },
      },
    },
  }, async (req) => {
    const { limit = '20' } = req.query as Record<string, string>;
    const feedbackSvc = new (await import('../services/feedback.service')).FeedbackService();
    return feedbackSvc.getPractitionerFeedback(req.currentUser.practitioner_id!, parseInt(limit, 10));
  });

  // GET /v1/practitioners/me/notifications
  fastify.get('/me/notifications', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'List notifications',
      description: 'Cursor-paginated list of in-app notifications, newest first.',
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data:       { type: 'array', items: { '$ref': 'Notification#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { cursor, limit = '20' } = req.query as Record<string, string>;
    return svc.listNotifications(req.currentUser.sub, cursor, parseInt(limit, 10));
  });

  // PATCH /v1/practitioners/me/notifications/:id/read
  fastify.patch('/me/notifications/:id/read', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Mark a notification as read',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: { 204: { type: 'null' } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await svc.markNotificationRead(req.currentUser.sub, id);
    return reply.status(204).send();
  });

  // PATCH /v1/practitioners/me/notifications/read-all
  fastify.patch('/me/notifications/read-all', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Mark all notifications as read',
      response: { 204: { type: 'null' } },
    },
  }, async (req, reply) => {
    await svc.markAllNotificationsRead(req.currentUser.sub);
    return reply.status(204).send();
  });

  // POST /v1/practitioners/me/profile-pic
  fastify.post('/me/profile-pic', {
    validatorCompiler: () => () => true,
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Upload profile picture',
      description: 'Multipart upload. Allowed types: JPEG/JPG, PNG, WEBP. Max size: 2MB.',
      consumes:    ['multipart/form-data'],
      body: {
        type: 'object',
        properties: {
          file: { type: 'string', format: 'binary', description: 'Image file (JPEG/PNG/WEBP)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            key: { type: 'string' },
          },
        },
        413: { description: 'File too large (max 2MB)', '$ref': 'Error#' },
        422: { description: 'Invalid file type', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ code: 'BAD_REQUEST', message: 'No file provided' });
    const allowedImageMimeTypes = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/x-png', 'image/webp'];
    if (!allowedImageMimeTypes.includes(data.mimetype)) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid file type. Allowed: JPEG, PNG, WEBP',
      });
    }
    const buffer = await data.toBuffer();
    if (buffer.length > 2 * 1024 * 1024) {
      return reply.status(413).send({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'File too large (max 2MB)',
      });
    }
    const s3Key = await storage.uploadDocument(
      req.currentUser.practitioner_id ?? 'unknown_prac', 
      'profile-pic', 
      data.filename, 
      data.mimetype, 
      buffer
    );
    await svc.updateProfilePic(req.currentUser.sub, s3Key);
    const downloadUrl = await storage.getSignedDownloadUrl(s3Key);
    return reply.status(200).send({ url: downloadUrl, key: s3Key });
  });

  // DELETE /v1/practitioners/me/profile-pic
  fastify.delete('/me/profile-pic', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Delete profile picture',
      response: {
        204: { description: 'Deleted', type: 'null' },
      },
    },
  }, async (req, reply) => {
    await svc.updateProfilePic(req.currentUser.sub, null);
    return reply.status(204).send();
  });
};

export default practitionerRoutes;
