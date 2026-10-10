import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { env } from "../env";

export interface StorageDriver {
  id: "local" | "s3";
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  id = "local" as const;
  private root = resolve(process.cwd(), env().STORAGE_LOCAL_DIR);

  private path(key: string) {
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}

class S3Storage implements StorageDriver {
  id = "s3" as const;
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client> | null = null;

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import("@aws-sdk/client-s3").then(({ S3Client }) => {
        const e = env();
        return new S3Client({
          region: e.S3_REGION,
          endpoint: e.S3_ENDPOINT,
          forcePathStyle: e.S3_FORCE_PATH_STYLE,
          credentials: e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY } : undefined,
        });
      });
    }
    return this.clientPromise;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.client()).send(new PutObjectCommand({ Bucket: env().S3_BUCKET!, Key: key, Body: data, ContentType: contentType }));
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (await this.client()).send(new GetObjectCommand({ Bucket: env().S3_BUCKET!, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.client()).send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET!, Key: key }));
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  const e = env();
  if (e.STORAGE_DRIVER === "s3") {
    if (!e.S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET.");
    driver = new S3Storage();
  } else {
    driver = new LocalStorage();
  }
  return driver;
}

export function storageKey(userId: string, id: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "file";
  return join("u", userId, `${id}-${safe}`).split(sep).join("/");
}
