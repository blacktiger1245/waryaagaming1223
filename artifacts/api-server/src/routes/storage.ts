import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';

import { ObjectPermission } from '../lib/objectAcl';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function isAdmin(req: Request): boolean {
  const discordAdmin =
    !!req.session?.userId &&
    (req.session?.role === 'admin' || req.session?.role === 'owner');
  return discordAdmin || !!req.session?.isAdmin;
}

/**
 * Require an authenticated session whose player role is exactly "owner".
 * Any other user (including "admin" role / legacy isAdmin sessions) is
 * rejected with 403 — this matches the Owner-only ads management rule.
 */
function requireOwner(req: Request, res: Response, next: import('express').NextFunction) {
  if (req.session?.role === 'owner') return next();
  res.status(403).json({ error: 'Owner privileges required' });
  return;
}

/**
 * POST /storage/uploads/team-logo
 *
 * Request a presigned URL for team logo upload.
 * Accessible to any logged-in user.
 */
router.post(
  '/storage/uploads/team-logo',
  async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'You must be logged in to upload a team logo' });
      return;
    }

    const { name = 'team-logo', size = 0, contentType = 'image/png' } = req.body ?? {};

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      req.log.error({ err: error }, 'Error generating team logo upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * POST /storage/uploads/team-logo/direct
 *
 * Upload a team logo through the API. This avoids browser-to-R2 CORS
 * requirements on hosts where the bucket does not expose PUT to the browser.
 */
router.post(
  '/storage/uploads/team-logo/direct',
  async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'You must be logged in to upload a team logo' });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'An image file is required' });
      return;
    }

    const contentType = req.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image uploads are supported' });
      return;
    }

    try {
      const objectPath = await objectStorageService.uploadObject(req.body, contentType);
      return res.status(201).json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, 'Error uploading team logo through API');
      return res.status(500).json({ error: 'Failed to upload team logo' });
    }
  },
);
/**
 * POST /storage/uploads/news-image/direct
 *
 * Upload a news article image through the API (server→R2) so the browser
 * never talks to the bucket directly (avoids bucket CORS requirements).
 * Only accessible to admins/owners — mirrors /storage/uploads/news-image.
 */
router.post(
  '/storage/uploads/news-image/direct',
  async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'An image file is required' });
      return;
    }

    const contentType = req.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image uploads are supported' });
      return;
    }

    try {
      const objectPath = await objectStorageService.uploadObject(req.body, contentType);
      return res.status(201).json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, 'Error uploading news image through API');
      return res.status(500).json({ error: 'Failed to upload news image' });
    }
  },
);
/**
 * POST /storage/uploads/community-media/direct
 *
 * Upload a community post image/video through the API so the browser never
 * talks to the bucket directly (avoids bucket CORS requirements). Accepted
 * content types are image/* and video/*. Any logged-in user may upload.
 */
router.post(
  '/storage/uploads/community-media/direct',
  async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'You must be logged in to upload media' });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'A media file is required' });
      return;
    }

    const contentType = req.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      res.status(400).json({ error: 'Only image and video uploads are supported' });
      return;
    }

    try {
      const objectPath = await objectStorageService.uploadObject(req.body, contentType);
      return res.status(201).json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, 'Error uploading community media through API');
      return res.status(500).json({ error: 'Failed to upload media' });
    }
  },
);
/**
 * POST /storage/uploads/ads-video/direct
 *
 * Upload an advertisement video through the API (server→R2) so the browser
 * never talks to the bucket directly. Owner-only — non-owners receive 403.
 * Only video/* content types are accepted; the raw body limit for video is
 * handled by the shared express.raw middleware (10mb default).
 */
router.post(
  '/storage/uploads/ads-video/direct',
  requireOwner,
  async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'A video file is required' });
      return;
    }

    const contentType = req.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('video/')) {
      res.status(400).json({ error: 'Only video uploads are supported' });
      return;
    }

    try {
      const objectPath = await objectStorageService.uploadObject(req.body, contentType);
      return res.status(201).json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, 'Error uploading advertisement video through API');
      return res.status(500).json({ error: 'Failed to upload advertisement video' });
    }
  },
);
/**
 * POST /storage/uploads/support-attachment/direct
 *
 * Upload a support ticket image attachment through the API so the browser
 * never talks to the bucket directly (avoids bucket-CORS "Failed to fetch").
 * Any logged-in user may upload (viewers upload screenshots for their own
 * tickets; the support routes enforce ticket ownership on the message write).
 */
router.post(
  '/storage/uploads/support-attachment/direct',
  async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'You must be logged in to upload an attachment' });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'An attachment is required' });
      return;
    }

    const contentType = req.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image attachments are supported' });
      return;
    }

    try {
      const objectPath = await objectStorageService.uploadObject(req.body, contentType);
      return res.status(201).json({ objectPath, attachmentType: contentType });
    } catch (error) {
      req.log.error({ err: error }, 'Error uploading support attachment through API');
      return res.status(500).json({ error: 'Failed to upload attachment' });
    }
  },
);
/**
 * POST /storage/uploads/serial-screenshot/direct
 *
 * Upload a serial-number proof screenshot through the API. Reuses the same
 * object-storage pipeline as the team-logo direct upload so the browser never
 * talks to the bucket directly. Any logged-in user may upload an image.
 */
router.post(
  '/storage/uploads/serial-screenshot/direct',
  async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'You must be logged in to upload a screenshot' });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'An image file is required' });
      return;
    }

    const contentType = req.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image uploads are supported' });
      return;
    }

    try {
      const objectPath = await objectStorageService.uploadObject(req.body, contentType);
      return res.status(201).json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, 'Error uploading serial screenshot through API');
      return res.status(500).json({ error: 'Failed to upload screenshot' });
    }
  },
);

/**
 * POST /storage/uploads/squad-image
 *
 * Request a presigned URL for squad image upload.
 * Accessible to any logged-in user (coach/captain gate is in the teams route).
 */
router.post(
  '/storage/uploads/squad-image',
  async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'Login required' });
      return;
    }

    const { name = 'squad-image', size = 0, contentType = 'image/jpeg' } = req.body ?? {};

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      req.log.error({ err: error }, 'Error generating squad image upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * POST /storage/uploads/community-image
 *
 * Request a presigned URL for community post image upload.
 * Accessible to any logged-in user.
 */
router.post(
  '/storage/uploads/community-image',
  async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'Login required' });
      return;
    }

    const { name = 'community-image', size = 0, contentType = 'image/jpeg' } = req.body ?? {};

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      req.log.error({ err: error }, 'Error generating community image upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * POST /storage/uploads/news-image
 *
 * Request a presigned URL for news article image upload.
 * Only accessible to admins/owners.
 */
router.post(
  '/storage/uploads/news-image',
  async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { name = 'news-image', size = 0, contentType = 'image/jpeg' } = req.body ?? {};

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      req.log.error({ err: error }, 'Error generating news image upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * Only accessible to admins/owners.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(401).json({ error: 'Unauthorized' });

      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * POST /storage/uploads/direct
 *
 * Upload an image through the API. This avoids browser-to-R2 CORS failures
 * when the frontend is hosted on a different origin.
 */
router.post(
  '/storage/uploads/direct',
  async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'An image file is required' });
      return;
    }

    const contentType = req.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image uploads are supported' });
      return;
    }

    try {
      const objectPath = await objectStorageService.uploadObject(req.body, contentType);
      return res.status(201).json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, 'Error uploading object through API');
      return res.status(500).json({ error: 'Failed to upload image' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
