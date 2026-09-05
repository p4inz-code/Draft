/**
 * Mirrors `draft-core`'s typed IDs (spec §8): stable `scheme://<uuid>` URIs,
 * one distinct TS type per kind so a `PageId` can't be passed where an
 * `ObjectId` is expected. The Rust side is authoritative — these are kept in
 * sync by hand at foundation stage; generating them from the Rust types is
 * a Session 2+ improvement once the schema stops moving.
 */

declare const brand: unique symbol;
type Branded<Scheme extends string> = string & { readonly [brand]: Scheme };

export type ProjectId = Branded<"project">;
export type PageId = Branded<"page">;
export type ObjectId = Branded<"object">;
export type AssetId = Branded<"asset">;
export type AnnotationId = Branded<"annotation">;
export type RegionId = Branded<"region">;

const SCHEMES = ["project", "page", "object", "asset", "annotation", "region"] as const;
type Scheme = (typeof SCHEMES)[number];

function isUriForScheme(value: string, scheme: Scheme): boolean {
  if (!value.startsWith(`${scheme}://`)) return false;
  const uuidPart = value.slice(scheme.length + 3);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidPart);
}

/** Parses and validates a `scheme://uuid` string as the given ID kind. */
export function parseId<S extends Scheme>(scheme: S, value: string): Branded<S> {
  if (!isUriForScheme(value, scheme)) {
    throw new Error(`invalid ${scheme} id: expected "${scheme}://<uuid>", got "${value}"`);
  }
  return value as Branded<S>;
}

export const parseProjectId = (value: string): ProjectId => parseId("project", value);
export const parsePageId = (value: string): PageId => parseId("page", value);
export const parseObjectId = (value: string): ObjectId => parseId("object", value);
export const parseAssetId = (value: string): AssetId => parseId("asset", value);
export const parseAnnotationId = (value: string): AnnotationId => parseId("annotation", value);
export const parseRegionId = (value: string): RegionId => parseId("region", value);

/**
 * Generates a new ID client-side (`crypto.randomUUID()`, so v4 — not the
 * time-ordered v7 the Rust side prefers via `draft-core`; acceptable since
 * nothing depends on client-generated IDs sorting by creation time, and
 * both are valid `scheme://uuid` values). Used when the canvas creates an
 * object locally before any round trip to the Rust core exists (Session 1).
 */
function newId<S extends Scheme>(scheme: S): Branded<S> {
  return `${scheme}://${crypto.randomUUID()}` as Branded<S>;
}

export const newProjectId = (): ProjectId => newId("project");
export const newPageId = (): PageId => newId("page");
export const newObjectId = (): ObjectId => newId("object");
export const newAssetId = (): AssetId => newId("asset");
export const newAnnotationId = (): AnnotationId => newId("annotation");
export const newRegionId = (): RegionId => newId("region");
