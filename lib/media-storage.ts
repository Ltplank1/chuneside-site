import { env } from "cloudflare:workers";

type MediaBucket = {
  put(key: string, value: ArrayBuffer | ReadableStream<Uint8Array>, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<unknown>;
  createMultipartUpload(key: string, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<MediaMultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): MediaMultipartUpload;
  head(key: string): Promise<{ size: number; httpEtag: string } | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<{ body: ReadableStream<Uint8Array>; size: number; httpEtag: string; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
};

export type MediaMultipartPart = { partNumber: number; etag: string };
export type MediaMultipartUpload = {
  uploadPart(partNumber: number, value: ArrayBuffer): Promise<MediaMultipartPart>;
  complete(parts: MediaMultipartPart[]): Promise<unknown>;
};

type MediaEnvironment = { MEDIA?: MediaBucket };

export function getMediaBucket() {
  const bucket = (env as unknown as MediaEnvironment).MEDIA;
  if (!bucket) throw new Error("Cloudflare R2 binding `MEDIA` is unavailable.");
  return bucket;
}
