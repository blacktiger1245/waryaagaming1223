import {
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { type S3ObjectRef } from './objectStorage';

// S3/R2 user-defined metadata key (stored lowercase, without the x-amz-meta- prefix)
const ACL_POLICY_METADATA_KEY = 'aclpolicy';

// Can be flexibly defined according to the use case.
//
// Examples:
// - USER_LIST: the users from a list stored in the database;
// - EMAIL_DOMAIN: the users whose email is in a specific domain;
// - GROUP_MEMBER: the users who are members of a specific group;
// - SUBSCRIBER: the users who are subscribers of a specific service / content
//   creator.
export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  // The logic id that identifies qualified group members. Format depends on the
  // ObjectAccessGroupType — e.g. a user-list DB id, an email domain, a group id.
  id: string;
}

export enum ObjectPermission {
  READ = 'read',
  WRITE = 'write',
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

// Stored as object user-defined metadata under "aclpolicy" (JSON string).
export interface ObjectAclPolicy {
  owner: string;
  visibility: 'public' | 'private';
  aclRules?: Array<ObjectAclRule>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    // Implement per access group type, e.g.:
    // case "USER_LIST":
    //   return new UserListAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

function makeS3Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
}

/**
 * Store an ACL policy on an existing R2 object by copying it to itself
 * with updated user-defined metadata (S3 MetadataDirective=REPLACE).
 */
export async function setObjectAclPolicy(
  ref: S3ObjectRef,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  const client = makeS3Client();

  // Fetch current metadata so we can preserve it
  const head = await client.send(
    new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
  );

  const existingMetadata = head.Metadata ?? {};
  const updatedMetadata: Record<string, string> = {
    ...existingMetadata,
    [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy),
  };

  // Copy object to itself with replaced metadata
  await client.send(
    new CopyObjectCommand({
      Bucket: ref.bucket,
      Key: ref.key,
      CopySource: `${ref.bucket}/${ref.key}`,
      Metadata: updatedMetadata,
      MetadataDirective: 'REPLACE',
      ContentType: head.ContentType,
    }),
  );
}

/**
 * Read the ACL policy from an R2 object's user-defined metadata.
 * Returns null if no policy has been set.
 */
export async function getObjectAclPolicy(
  ref: S3ObjectRef,
): Promise<ObjectAclPolicy | null> {
  const client = makeS3Client();

  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
    );
    const raw = head.Metadata?.[ACL_POLICY_METADATA_KEY];
    if (!raw) return null;
    return JSON.parse(raw) as ObjectAclPolicy;
  } catch {
    return null;
  }
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: S3ObjectRef;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === 'public' &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
