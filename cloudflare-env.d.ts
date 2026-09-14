type Fetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

// Cloudflare supplies this interface at runtime; Drizzle owns its detailed contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    MEDIA?: unknown;
  };
}
