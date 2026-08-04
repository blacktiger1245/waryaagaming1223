import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from './objectAcl';

// ---------------------------------------------------------------------------
// R2 config helpers
// ---------------------------------------------------------------------------

function getR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must all be set.',
    );
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getR2BucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error('R2_BUCKET_NAME must be set.');
  }
  return bucket;
}

// ---------------------------------------------------------------------------
// Shared object reference type (replaces GCS File)
// ---------------------------------------------------------------------------

export interface S3ObjectRef {
  bucket: string;
  key: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ObjectStorageService {
  /**
   * Generate a 15-minute presigned PUT URL for a new upload.
   * Returns the raw presigned URL; use normalizeObjectEntityPath to get the
   * canonical /objects/... path to store in the database.
   */
  async getObjectEntityUploadURL(): Promise<string> {
    const client = getR2Client();
    const bucket = getR2BucketName();
    const objectId = randomUUID();
    const key = `uploads/${objectId}`;

    const command = new PutObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: 900 });
  }

  /**
   * Convert a raw presigned R2 URL into the canonical /objects/<key> path
   * that gets stored in the database and used in GET /storage/objects/*.
   *
   * R2 presigned PUT URL shape:
   *   https://<account>.r2.cloudflarestorage.com/<bucket>/<key>?X-Amz-...
   *
   * If rawPath is already a /objects/... path, it is returned unchanged.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    const r2Endpoint = process.env.R2_ENDPOINT ?? '';

    // Already normalised
    if (rawPath.startsWith('/objects/')) {
      return rawPath;
    }

    try {
      const url = new URL(rawPath);
      // Only normalise URLs that point at our R2 endpoint
      const endpointHost = new URL(r2Endpoint).hostname;
      if (url.hostname !== endpointHost) {
        return rawPath;
      }

      // pathname: /<bucket>/<key...>
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length < 2) {
        return rawPath;
      }

      // pathParts[0] = bucket name, pathParts[1..] = key segments
      const key = pathParts.slice(1).join('/');
      return `/objects/${key}`;
    } catch {
      return rawPath;
    }
  }

  /**
   * Look up an object by its canonical /objects/<key> path.
   * Throws ObjectNotFoundError if the object does not exist in R2.
   */
  async getObjectEntityFile(objectPath: string): Promise<S3ObjectRef> {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }

    const key = objectPath.slice('/objects/'.length);
    if (!key) {
      throw new ObjectNotFoundError();
    }

    const client = getR2Client();
    const bucket = getR2BucketName();

    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err: unknown) {
      const awsErr = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        awsErr.name === 'NotFound' ||
        awsErr.name === 'NoSuchKey' ||
        awsErr.$metadata?.httpStatusCode === 404
      ) {
        throw new ObjectNotFoundError();
      }
      throw err;
    }

    return { bucket, key };
  }

  /**
   * Search configured public paths for the given file path.
   * PUBLIC_OBJECT_SEARCH_PATHS is a comma-separated list of key prefixes.
   */
  async searchPublicObject(filePath: string): Promise<S3ObjectRef | null> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? '';
    const searchPaths = pathsStr
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (searchPaths.length === 0) {
      return null;
    }

    const client = getR2Client();
    const bucket = getR2BucketName();

    for (const prefix of searchPaths) {
      const key = `${prefix}/${filePath}`;
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { bucket, key };
      } catch (err: unknown) {
        const awsErr = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (
          awsErr.name === 'NotFound' ||
          awsErr.name === 'NoSuchKey' ||
          awsErr.$metadata?.httpStatusCode === 404
        ) {
          continue;
        }
        throw err;
      }
    }

    return null;
  }

  /**
   * Stream an object to the caller as a Web Response.
   */
  async downloadObject(
    ref: S3ObjectRef,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const client = getR2Client();

    const result = await client.send(
      new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
    );

    const aclPolicy = await getObjectAclPolicy(ref);
    const isPublic = aclPolicy?.visibility === 'public';

    const headers: Record<string, string> = {
      'Content-Type': result.ContentType ?? 'application/octet-stream',
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
    };
    if (result.ContentLength !== undefined) {
      headers['Content-Length'] = String(result.ContentLength);
    }

    // result.Body is an sdkStreamMixin which is a Node.js Readable
    const nodeStream = result.Body as NodeJS.ReadableStream;
    const webStream = Readable.toWeb(
      Readable.from(nodeStream),
    ) as ReadableStream<Uint8Array>;

    return new Response(webStream, { headers });
  }

  /**
   * Normalise the path and, if valid, attach an ACL policy to the object.
   */
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/')) {
      return normalizedPath;
    }

    const objectRef = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectRef, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: S3ObjectRef;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
