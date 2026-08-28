import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import type {StorageBackend} from '../account/keystore';

const BASE = {baseDir: BaseDirectory.AppData} as const;

function parentDir(path: string): string | null {
  const idx = path.lastIndexOf('/');
  if (idx <= 0) return null;
  return path.slice(0, idx);
}

async function ensureParent(path: string): Promise<void> {
  const dir = parentDir(path);
  if (!dir) return;
  const dirExists = await exists(dir, BASE).catch(() => false);
  if (!dirExists) {
    await mkdir(dir, {...BASE, recursive: true});
  }
}

export const tauriFsStorage: StorageBackend = {
  async read(path) {
    const found = await exists(path, BASE).catch(() => false);
    if (!found) return null;
    return readTextFile(path, BASE);
  },

  async write(path, data) {
    await ensureParent(path);
    await writeTextFile(path, data, BASE);
  },

  async exists(path) {
    return exists(path, BASE).catch(() => false);
  },

  async delete(path) {
    const found = await exists(path, BASE).catch(() => false);
    if (found) {
      await remove(path, BASE);
    }
  },

  async listFiles(directory) {
    const dirExists = await exists(directory, BASE).catch(() => false);
    if (!dirExists) return [];
    const entries = await readDir(directory, BASE);
    return entries
      .filter(e => e.isFile)
      .map(e => e.name)
      .filter((name): name is string => typeof name === 'string');
  },
};
