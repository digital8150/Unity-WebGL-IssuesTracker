import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { isAddressablesCatalogMetadataFilename } from './addressablesPatterns.js';

export const DEFAULT_ARCHIVE_LIMITS = {
  maxEntries: 100_000,
  maxEntryBytes: 256 * 1024 * 1024,
  maxBytes: 2 * 1024 * 1024 * 1024,
};

export function assetArchiveError(message, status = 413) {
  const error = new Error(message);
  error.status = status;
  error.code = 'ARCHIVE_LIMIT_EXCEEDED';
  return error;
}

function archiveLabel(options = {}) {
  return options.label || 'archive';
}

function archiveErrorMessage(options, kind) {
  const label = archiveLabel(options);
  if (label === 'StreamingAssets') {
    if (kind === 'entries') return 'StreamingAssets zip contains too many files';
    if (kind === 'entry') return 'A StreamingAssets file is too large';
    return 'StreamingAssets zip is too large after extraction';
  }
  if (kind === 'entries') return `${label} zip contains too many files`;
  // Phrased around the zip rather than the label so any label reads correctly;
  // "A ${label} file" produces "A Addressables content file".
  if (kind === 'entry') return `A file in the ${label} zip is too large`;
  return `${label} zip is too large after extraction`;
}

function normalizedEntryParts(entryName) {
  return String(entryName ?? '').replaceAll('\\', '/').split('/').filter(Boolean);
}

function shouldStripWrapper(entries, wrapperNames) {
  const names = new Set((wrapperNames || []).map((name) => String(name).toLowerCase()));
  if (!names.size || !entries.length) return false;
  const parts = entries.map((entry) => normalizedEntryParts(entry.entryName));
  // Strip only a wrapper every entry actually shares, and only when each entry
  // has something beneath it. Accepting any name from the set would merge two
  // distinct wrapper trees into one path space, and a bare root-level file
  // named after a wrapper would strip to an empty path and be dropped.
  if (parts.some((entryParts) => entryParts.length < 2)) return false;
  const wrapper = parts[0][0].toLowerCase();
  if (!names.has(wrapper)) return false;
  return parts.every((entryParts) => entryParts[0].toLowerCase() === wrapper);
}

function isHashedBundle(filename) {
  return /[0-9a-f]{32}/i.test(path.posix.basename(filename));
}

/**
 * Extract a zip into an explicit directory while preserving its relative tree.
 * The returned paths include `prefix` when one is supplied. Extraction happens
 * entry by entry so the running byte cap stops oversized archives early.
 */
export async function extractArchive(zipPath, destinationRoot, options = {}) {
  const limits = { ...DEFAULT_ARCHIVE_LIMITS, ...(options.limits || {}) };
  const prefix = String(options.prefix || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  const wrapperNames = options.wrapperNames || [];
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (entries.length > limits.maxEntries) {
    throw assetArchiveError(archiveErrorMessage(options, 'entries'));
  }

  const stripWrapper = shouldStripWrapper(entries, wrapperNames);
  const destRoot = path.resolve(destinationRoot);
  const relPaths = [];
  const seenPaths = new Set();
  let totalBytes = 0;
  let unhashedBundleCount = 0;

  await fs.mkdir(destRoot, { recursive: true });

  for (const entry of entries) {
    const rawParts = normalizedEntryParts(entry.entryName);
    const parts = stripWrapper ? rawParts.slice(1) : rawParts;
    if (!parts.length || parts.some((part) => part === '..' || part === '.')) continue;

    const relPath = path.posix.join(...parts);
    const relativeFile = prefix ? path.posix.join(prefix, relPath) : relPath;
    if (seenPaths.has(relativeFile)) continue;
    seenPaths.add(relativeFile);

    const dest = path.resolve(destRoot, ...parts);
    if (!dest.startsWith(destRoot + path.sep) && dest !== destRoot) continue;

    const declaredSize = Number(entry.header?.size ?? 0);
    if (declaredSize > limits.maxEntryBytes) {
      throw assetArchiveError(archiveErrorMessage(options, 'entry'));
    }

    const data = entry.getData();
    if (data.length > limits.maxEntryBytes) {
      throw assetArchiveError(archiveErrorMessage(options, 'entry'));
    }
    if (totalBytes + data.length > limits.maxBytes) {
      throw assetArchiveError(archiveErrorMessage(options, 'total'));
    }

    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
    const stat = await fs.stat(dest);
    totalBytes += stat.size;
    relPaths.push(relativeFile);
    if (path.posix.extname(path.posix.basename(relPath)).toLowerCase() === '.bundle' && !isHashedBundle(relPath)) {
      unhashedBundleCount += 1;
    }
  }

  return { relPaths, totalBytes, unhashedBundleCount };
}

export async function moveFile(src, dest) {
  try {
    await fs.rename(src, dest);
  } catch (error) {
    if (error.code === 'EXDEV') {
      await fs.copyFile(src, dest);
      await fs.rm(src, { force: true });
      return;
    }
    throw error;
  }
}

export async function sweepSwapArtifacts(parentDir, prefixes = []) {
  let entries;
  try {
    entries = await fs.readdir(parentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!prefixes.some((prefix) => entry.name.startsWith(prefix))) continue;
    await fs.rm(path.join(parentDir, entry.name), { recursive: true, force: true });
  }
}

export function acquireAssetReplaceLock(key, locks) {
  const lockKey = String(key);
  if (locks.has(lockKey)) return null;

  let release;
  const lock = new Promise((resolve) => { release = resolve; });
  locks.set(lockKey, lock);
  return () => {
    if (locks.get(lockKey) === lock) locks.delete(lockKey);
    release();
  };
}

export async function extractAndSwapArchive(zipPath, parentDir, options = {}) {
  const token = randomUUID();
  const tempPrefix = options.tempPrefix || '.asset-tmp-';
  const oldPrefix = options.oldPrefix || '.asset-old-';
  const tempDir = path.join(parentDir, `${tempPrefix}${token}`);
  const oldDir = path.join(parentDir, `${oldPrefix}${token}`);
  const liveDir = path.join(parentDir, options.liveDirName || 'live');
  let oldMoved = false;
  let swapped = false;

  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(oldDir, { recursive: true, force: true });
    const extracted = await extractArchive(zipPath, tempDir, options.extractOptions);
    const beforeCommitResult = await options.beforeCommit?.({ tempDir, liveDir, extracted });

    try {
      await fs.rename(liveDir, oldDir);
      oldMoved = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    try {
      await fs.rename(tempDir, liveDir);
    } catch (error) {
      if (oldMoved) {
        try {
          await fs.rename(oldDir, liveDir);
        } catch (rollbackError) {
          error.rollbackError = rollbackError;
        }
      }
      throw error;
    }
    swapped = true;
    await fs.rm(oldDir, { recursive: true, force: true });
    return { ...extracted, beforeCommitResult };
  } finally {
    if (!swapped) await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function walkFiles(rootDir) {
  const result = [];
  async function visit(currentDir, relativeDir = '') {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      const filePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath, relative);
      } else if (entry.isFile()) {
        result.push({ filePath, relative: relative.split(path.sep).join('/') });
      }
    }
  }
  await visit(rootDir);
  return result;
}

export async function describeDirectoryFiles(rootDir) {
  const files = await walkFiles(rootDir);
  return Promise.all(files.map(async (file) => {
    const stat = await fs.stat(file.filePath);
    return { path: file.relative, size: stat.size };
  }));
}

export async function describeMergedDirectoryFiles(liveDir, stagedDir) {
  const merged = new Map();
  for (const file of await describeDirectoryFiles(liveDir)) merged.set(file.path, file);
  for (const file of await describeDirectoryFiles(stagedDir)) merged.set(file.path, file);
  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
}

// Addressables resolves bundles through the catalog, so the catalog must never
// become live ahead of the payload it names. `walkFiles` returns entries
// alphabetically, which puts `catalog_*.json` before most bundle filenames and
// would leave a window where a client reads a catalog whose bundles are not on
// disk yet. Installing metadata last closes that window for merge uploads.
function metadataLast(files) {
  const isMetadata = (file) => isAddressablesCatalogMetadataFilename(file.relative);
  return [...files.filter((file) => !isMetadata(file)), ...files.filter(isMetadata)];
}

export async function mergeArchiveTree(tempDir, liveDir) {
  const files = await walkFiles(tempDir);
  for (const file of metadataLast(files)) {
    const destination = path.join(liveDir, ...file.relative.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await moveFile(file.filePath, destination);
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  return files;
}

export async function extractAndMergeArchive(zipPath, parentDir, options = {}) {
  const token = randomUUID();
  const tempPrefix = options.tempPrefix || '.asset-tmp-';
  const tempDir = path.join(parentDir, `${tempPrefix}${token}`);
  const liveDir = path.join(parentDir, options.liveDirName || 'live');
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    const extracted = await extractArchive(zipPath, tempDir, options.extractOptions);
    const beforeCommitResult = await options.beforeCommit?.({ tempDir, liveDir, extracted });
    await fs.mkdir(liveDir, { recursive: true });
    await mergeArchiveTree(tempDir, liveDir);
    return { ...extracted, beforeCommitResult };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function listDirectoryFiles(rootDir, { offset = 0, limit = 100 } = {}) {
  const files = await walkFiles(rootDir);
  const page = [];
  for (const file of files.slice(offset, offset + limit + 1)) {
    const stat = await fs.stat(file.filePath);
    page.push({
      path: file.relative,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
  const hasMore = page.length > limit;
  return { files: hasMore ? page.slice(0, limit) : page, hasMore };
}

export async function calculateDirectoryStats(rootDir) {
  const files = await walkFiles(rootDir);
  let storageBytes = 0;
  let unhashedBundleCount = 0;
  for (const file of files) {
    const stat = await fs.stat(file.filePath);
    storageBytes += stat.size;
    if (path.posix.extname(path.posix.basename(file.relative)).toLowerCase() === '.bundle' && !isHashedBundle(file.relative)) {
      unhashedBundleCount += 1;
    }
  }
  return { fileCount: files.length, storageBytes, unhashedBundleCount };
}

export { isHashedBundle };
