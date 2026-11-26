// File + version store on local disk.
// shortcut: plaintext JSON + blobs on a volume, no encryption or Postgres, demo only — replace with the factory build (TASK-003/005) before any real data.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export async function openStore(dataDir) {
  const metaPath = path.join(dataDir, 'meta.json');
  await fs.mkdir(path.join(dataDir, 'blobs'), { recursive: true });
  let meta = { files: {} };
  try {
    meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  let writing = Promise.resolve();

  const persist = () => {
    writing = writing.then(async () => {
      const tmp = `${metaPath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(meta, null, 2));
      await fs.rename(tmp, metaPath);
    });
    return writing;
  };

  const blobPath = (fileId, versionId) => path.join(dataDir, 'blobs', fileId, versionId);

  async function addVersion(fileId, bytes, { kind, participants = [], documentKey = null }) {
    const file = meta.files[fileId];
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const duplicate = documentKey && file.versions.find((v) => v.documentKey === documentKey && v.sha256 === sha256);
    if (duplicate) return { version: duplicate, created: false };
    const head = file.versions.at(-1);
    if (head && head.sha256 === sha256) return { version: head, created: false };
    const version = { id: crypto.randomUUID(), kind, sha256, size: bytes.length, participants, documentKey, createdAt: new Date().toISOString() };
    await fs.mkdir(path.dirname(blobPath(fileId, version.id)), { recursive: true });
    await fs.writeFile(blobPath(fileId, version.id), bytes, { flag: 'wx' });
    file.versions.push(version);
    await persist();
    return { version, created: true };
  }

  return {
    list: () => Object.values(meta.files),
    get: (id) => meta.files[id] ?? null,
    async createFile({ name, ext, bytes, createdBy }) {
      const id = crypto.randomUUID();
      meta.files[id] = { id, name, ext, createdBy, createdAt: new Date().toISOString(), versions: [] };
      await addVersion(id, bytes, { kind: 'initial', participants: [createdBy] });
      return meta.files[id];
    },
    addVersion,
    /** Re-label an existing version (WOPI: the last save before UNLOCK becomes the milestone). */
    async promote(fileId, versionId, kind) {
      const version = meta.files[fileId]?.versions.find((v) => v.id === versionId);
      if (!version) throw new Error('unknown version');
      version.kind = kind;
      await persist();
    },
    readVersion: (fileId, versionId) => fs.readFile(blobPath(fileId, versionId)),
  };
}
