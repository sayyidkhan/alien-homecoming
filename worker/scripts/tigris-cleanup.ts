/**
 * One-off, server-side-only cleanup for the shared realm-art Tigris bucket.
 *
 * Defaults to a dry-run listing. Pass `--apply` to actually delete objects.
 *
 * Usage:
 *   # Dry run (safe, lists what would be deleted):
 *   bun run worker/scripts/tigris-cleanup.ts
 *
 *   # Real delete (irreversible):
 *   bun run worker/scripts/tigris-cleanup.ts --apply
 *
 * Requires the following env vars (same values as the Worker):
 *   TIGRIS_STORAGE_ENDPOINT   e.g. https://t3.storage.dev
 *   TIGRIS_BUCKET             e.g. alien-homecoming-art
 *   TIGRIS_REGION             defaults to "auto"
 *   TIGRIS_STORAGE_ACCESS_KEY_ID
 *   TIGRIS_STORAGE_SECRET_ACCESS_KEY
 *
 * NEVER expose these credentials to the frontend. This script is intended to
 * be run manually by an operator from a trusted machine only. There is no
 * matching HTTP endpoint on the Worker or the app.
 */
import { AwsClient } from "aws4fetch";

const PREFIX = "realm-art/";
const LEGACY_PREFIX = "realms/";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return value;
}

const endpoint = requireEnv("TIGRIS_STORAGE_ENDPOINT").replace(/\/$/, "");
const bucket = requireEnv("TIGRIS_BUCKET");
const region = process.env.TIGRIS_REGION || "auto";
const apply = process.argv.includes("--apply");

const client = new AwsClient({
  accessKeyId: requireEnv("TIGRIS_STORAGE_ACCESS_KEY_ID"),
  secretAccessKey: requireEnv("TIGRIS_STORAGE_SECRET_ACCESS_KEY"),
  service: "s3",
  region,
});

function bucketUrl(path = "") {
  return `${endpoint}/${encodeURIComponent(bucket)}${path}`;
}

async function listAll(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const params = new URLSearchParams({
      "list-type": "2",
      prefix,
      "max-keys": "1000",
    });
    if (continuationToken) params.set("continuation-token", continuationToken);
    const response = await client.fetch(`${bucketUrl()}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`List failed (${response.status}): ${await response.text()}`);
    }
    const xml = await response.text();
    for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(match[1]);
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const nextMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    continuationToken = truncated && nextMatch ? nextMatch[1] : undefined;
  } while (continuationToken);
  return keys;
}

async function deleteKey(key: string) {
  const path = "/" + key.split("/").map(encodeURIComponent).join("/");
  const response = await client.fetch(bucketUrl(path), { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Delete failed for ${key} (${response.status})`);
  }
}

async function main() {
  console.log(`Tigris cleanup — bucket=${bucket} endpoint=${endpoint}`);
  console.log(`Mode: ${apply ? "APPLY (will delete)" : "DRY RUN (no changes)"}`);

  const [current, legacy] = await Promise.all([listAll(PREFIX), listAll(LEGACY_PREFIX)]);
  const all = Array.from(new Set([...current, ...legacy])).sort();
  console.log(`Found ${all.length} object(s) matching realm-art prefixes.`);
  for (const key of all) console.log(`  - ${key}`);

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to delete these objects.");
    return;
  }
  if (all.length === 0) {
    console.log("Nothing to delete.");
    return;
  }
  let done = 0;
  for (const key of all) {
    await deleteKey(key);
    done += 1;
    if (done % 25 === 0) console.log(`Deleted ${done}/${all.length}`);
  }
  console.log(`Deleted ${done} object(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
