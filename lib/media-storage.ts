import { env } from "cloudflare:workers";

type MediaBucket = {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<unknown>;
  head(key: string): Promise<{ size: number; httpEtag: string } | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<{ body: ReadableStream<Uint8Array>; size: number; httpEtag: string; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
};

type MediaEnvironment = { MEDIA?: MediaBucket };

export function getMediaBucket() {
  const bucket = (env as unknown as MediaEnvironment).MEDIA;
  if (!bucket) throw new Error("Cloudflare R2 binding `MEDIA` is unavailable.");
  return bucket;
}
