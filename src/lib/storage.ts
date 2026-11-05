import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { storageDriver } from "./storage-config";
import { db } from "./db";
import { createStorageSigningClock } from "./storage-clock";
const s3 = new S3Client({
  forcePathStyle: true,
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
});
// The database is already the booking deadline authority. Anchor signing to it
// as well; laptop sleep/clock drift can otherwise make private uploads fail.
const signingOffset=createStorageSigningClock(async()=>{
  const result=await db.query<{now:Date}>("SELECT clock_timestamp() AS now");
  return result.rows[0].now.getTime();
});
function localPath(key: string) {
  if (!/^[a-f0-9-]+\/[a-f0-9-]+$/.test(key)) throw Error("Invalid storage key");
  return path.join(process.cwd(), ".private-storage", key);
}
export async function storeFile(key: string, bytes: Uint8Array, mime: string) {
  const driver = storageDriver(process.env.STORAGE_DRIVER);
  if (driver === "s3") {
    s3.config.systemClockOffset=await signingOffset();
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: mime,
        CacheControl: "private, no-store",
      }),
    );
  } else {
    const dest = localPath(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes, { flag: "wx" });
  }
}
export async function loadFile(
  key: string,
  backend = process.env.STORAGE_DRIVER,
) {
  if (storageDriver(backend) === "s3") {
    s3.config.systemClockOffset=await signingOffset();
    const r = await s3.send(
      new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }),
    );
    if (!r.Body) throw Error("Missing file");
    return Buffer.from(await r.Body.transformToByteArray());
  }
  return readFile(localPath(key));
}
export async function removeOrphan(key: string) {
  if (storageDriver(process.env.STORAGE_DRIVER) === "s3") {
    s3.config.systemClockOffset=await signingOffset();
    await s3.send(
      new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }),
    );
  } else await unlink(localPath(key));
}
