import { S3Client, type S3File } from "bun";

let client: S3Client | undefined;

export function s3(): S3Client {
  if (!client) {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const bucket = process.env.S3_BUCKET;
    const endpoint = process.env.S3_ENDPOINT;
    if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
      throw new Error(
        "Missing S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, or S3_ENDPOINT. See .env.example and plan.md.",
      );
    }
    client = new S3Client({
      accessKeyId,
      secretAccessKey,
      bucket,
      endpoint,
      region: process.env.S3_REGION || "auto",
    });
  }
  return client;
}

export function compiledObject(path: string): S3File {
  return s3().file(path);
}
