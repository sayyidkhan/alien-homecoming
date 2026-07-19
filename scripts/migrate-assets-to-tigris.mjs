#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { AwsClient } from "aws4fetch";

const [input = "assets", ...args] = process.argv.slice(2);
const apply = args.includes("--apply");
const source = resolve(input);
const prefix = (process.env.TIGRIS_OBJECT_PREFIX || "static").replace(/^\/+|\/+$/g, "");

const contentTypes = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return filesIn(path);
      return entry.isFile() && contentTypes[extname(entry.name).toLowerCase()] ? [path] : [];
    }),
  );
  return files.flat();
}

function objectKey(path) {
  const filePath = relative(source, path).split("\\").join("/");
  return [prefix, filePath].filter(Boolean).join("/");
}

function objectUrl(key) {
  const endpoint = process.env.TIGRIS_STORAGE_ENDPOINT?.replace(/\/$/, "");
  const bucket = process.env.TIGRIS_BUCKET;
  if (!endpoint || !bucket) throw new Error("Set TIGRIS_STORAGE_ENDPOINT and TIGRIS_BUCKET.");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${endpoint}/${encodeURIComponent(bucket)}/${path}`;
}

function client() {
  const accessKeyId = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Set TIGRIS_STORAGE_ACCESS_KEY_ID and TIGRIS_STORAGE_SECRET_ACCESS_KEY.");
  }
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: process.env.TIGRIS_REGION || "auto",
  });
}

try {
  const sourceStats = await stat(source);
  if (!sourceStats.isDirectory()) throw new Error(`${source} is not a directory.`);
  const files = await filesIn(source);
  if (files.length === 0) {
    console.log(`No supported image assets found in ${source}.`);
    process.exit(0);
  }

  console.log(`${apply ? "Uploading" : "Would upload"} ${files.length} asset(s) from ${source}:`);
  for (const path of files) {
    const key = objectKey(path);
    if (!apply) {
      console.log(`  ${path} -> ${key}`);
      continue;
    }
    const body = await readFile(path);
    const response = await client().fetch(objectUrl(key), {
      method: "PUT",
      headers: {
        "Content-Type": contentTypes[extname(path).toLowerCase()],
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body,
    });
    if (!response.ok) throw new Error(`Upload failed for ${key} (${response.status}).`);
    console.log(`  uploaded ${key}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
