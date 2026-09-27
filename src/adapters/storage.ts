import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";

// Contracts are private documents: stored outside the web root, served only through an
// authorised route. Vercel Blob (private) is the hosted alternative (docs/05 §10).
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  readonly driver: string;
}

class LocalStorage implements Storage {
  readonly driver = "local";
  constructor(private root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root))) throw new Error("Invalid storage key");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
  async delete(key: string) {
    await unlink(this.resolve(key)).catch(() => undefined);
  }
}

let instance: Storage | undefined;

export function storage(): Storage {
  if (instance) return instance;
  const e = env();
  if (e.STORAGE_DRIVER === "vercel-blob") {
    throw new Error("The vercel-blob storage driver is configured but not installed in this build. Use STORAGE_DRIVER=local.");
  }
  instance = new LocalStorage(path.resolve(e.STORAGE_LOCAL_DIR)) // relative paths resolve from the working directory;
  return instance;
}

export function setStorageForTests(s: Storage) {
  instance = s;
}
