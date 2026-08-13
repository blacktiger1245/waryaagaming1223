import { z } from "zod/v4";

// Storage upload endpoints are implemented outside the OpenAPI-generated
// surface because their upload URL contract is shared with object storage.
export const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});
export type RequestUploadUrlBody = z.infer<typeof RequestUploadUrlBody>;

export const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({
    name: z.string(),
    size: z.number(),
    contentType: z.string(),
  }),
});
export type RequestUploadUrlResponse = z.infer<typeof RequestUploadUrlResponse>;