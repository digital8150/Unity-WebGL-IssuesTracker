import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import AdmZip from 'adm-zip';

import {
  acquireAssetReplaceLock,
  assetArchiveError,
  calculateDirectoryStats,
  extractAndMergeArchive,
  extractAndSwapArchive,
  extractArchive,
  isHashedBundle,
  listDirectoryFiles,
  mergeArchiveTree,
  sweepSwapArtifacts,
} from '../src/services/assetArchive.js';

async function mkTmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'asset-archive-test-'));
}

// AdmZip's own addFile() sanitizes ".." segments out of entry names before they
// ever reach the zip buffer, so a zip-slip payload has to be forged by writing
// the entryName directly on the ZipEntry object after adding a placeholder.
function zipWithRawEntryNames(entries) {
  const zip = new AdmZip();
  entries.forEach(([, contents], index) => zip.addFile(`placeholder-${index}`, Buffer.from(contents)));
  zip.getEntries().forEach((entry, index) => { entry.entryName = entries[index][0]; });
  return zip.toBuffer();
}

function makeZip(entries) {
  const zip = new AdmZip();
  for (const [name, contents] of entries) zip.addFile(name, Buffer.from(contents));
  return zip.toBuffer();
}

test('extractArchive skips zip-slip entries while extracting legitimate ones', async () => {
  const tmpRoot = await mkTmp();
  const zipPath = path.join(tmpRoot, 'input.zip');
  const dest = path.join(tmpRoot, 'dest');
  await fs.writeFile(zipPath, zipWithRawEntryNames([
    ['ok.txt', 'fine'],
    ['../../escape.txt', 'evil'],
    ['nested/../../also-escape.txt', 'evil too'],
  ]));

  try {
    const result = await extractArchive(zipPath, dest, {});
    assert.deepEqual(result.relPaths, ['ok.txt']);
    assert.equal(await fs.readFile(path.join(dest, 'ok.txt'), 'utf8'), 'fine');

    // Skipped entries must not land anywhere on disk, not even sanitized.
    await assert.rejects(fs.access(path.join(dest, 'escape.txt')));
    await assert.rejects(fs.access(path.join(dest, 'also-escape.txt')));
    await assert.rejects(fs.access(path.join(tmpRoot, 'escape.txt')));
    await assert.rejects(fs.access(path.join(path.dirname(tmpRoot), 'escape.txt')));
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('extractArchive rejects an over-cap entry with a 413 status', async () => {
  const tmpRoot = await mkTmp();
  const zipPath = path.join(tmpRoot, 'input.zip');
  const dest = path.join(tmpRoot, 'dest');
  await fs.writeFile(zipPath, makeZip([['big.bin', 'x'.repeat(50)]]));

  try {
    await assert.rejects(
      () => extractArchive(zipPath, dest, { limits: { maxEntryBytes: 10 }, label: 'Addressables content' }),
      (error) => {
        assert.equal(error.status, 413);
        assert.equal(error.message, 'A file in the Addressables content zip is too large');
        return true;
      },
    );
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('extractArchive rejects an over-cap running total and stops early with a 413 status', async () => {
  const tmpRoot = await mkTmp();
  const zipPath = path.join(tmpRoot, 'input.zip');
  const dest = path.join(tmpRoot, 'dest');
  await fs.writeFile(zipPath, makeZip([
    ['first.bin', 'aaaaa'],
    ['second.bin', 'bbbbb'],
  ]));

  try {
    await assert.rejects(
      () => extractArchive(zipPath, dest, { limits: { maxBytes: 6 } }),
      (error) => {
        assert.equal(error.status, 413);
        assert.equal(error.message, 'archive zip is too large after extraction');
        return true;
      },
    );
    // The running total check trips mid-loop: the entry already under the cap
    // stays written even though the archive call as a whole rejects.
    assert.equal(await fs.readFile(path.join(dest, 'first.bin'), 'utf8'), 'aaaaa');
    await assert.rejects(fs.access(path.join(dest, 'second.bin')));
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('a serverdata wrapper folder is stripped while an already-inner zip is unaffected', async () => {
  const tmpRoot = await mkTmp();
  const wrapperOptions = { wrapperNames: ['serverdata', 'streamingassets'] };

  const wrappedZipPath = path.join(tmpRoot, 'wrapped.zip');
  const wrappedDest = path.join(tmpRoot, 'wrapped-dest');
  await fs.writeFile(wrappedZipPath, makeZip([
    ['ServerData/WebGL/catalog_1.json', '{}'],
    ['ServerData/WebGL/bundle.bundle', 'data'],
  ]));

  const innerZipPath = path.join(tmpRoot, 'inner.zip');
  const innerDest = path.join(tmpRoot, 'inner-dest');
  await fs.writeFile(innerZipPath, makeZip([
    ['WebGL/catalog_1.json', '{}'],
    ['WebGL/bundle.bundle', 'data'],
  ]));

  try {
    const wrapped = await extractArchive(wrappedZipPath, wrappedDest, wrapperOptions);
    const inner = await extractArchive(innerZipPath, innerDest, wrapperOptions);

    assert.deepEqual(wrapped.relPaths.sort(), ['WebGL/bundle.bundle', 'WebGL/catalog_1.json']);
    assert.deepEqual(inner.relPaths.sort(), wrapped.relPaths.sort());
    assert.equal(await fs.readFile(path.join(wrappedDest, 'WebGL', 'catalog_1.json'), 'utf8'), '{}');
    assert.equal(await fs.readFile(path.join(innerDest, 'WebGL', 'catalog_1.json'), 'utf8'), '{}');
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('isHashedBundle detects a 32-hex-character content hash anywhere in the basename', () => {
  assert.equal(isHashedBundle('assets_all_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.bundle'), true);
  assert.equal(isHashedBundle('WebGL/nested/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.bundle'), true);
  assert.equal(isHashedBundle('assets_all.bundle'), false);
  assert.equal(isHashedBundle('catalog_2026.json'), false);
});

test('merge preserves a file absent from the new archive while replace removes it', async () => {
  const tmpRoot = await mkTmp();
  const parentDir = tmpRoot;

  const mergeLive = path.join(parentDir, 'merge-channel');
  await fs.mkdir(mergeLive, { recursive: true });
  await fs.writeFile(path.join(mergeLive, 'keep.txt'), 'keep me');
  const mergeZipPath = path.join(tmpRoot, 'merge.zip');
  await fs.writeFile(mergeZipPath, makeZip([['fresh.txt', 'fresh']]));

  const replaceLive = path.join(parentDir, 'replace-channel');
  await fs.mkdir(replaceLive, { recursive: true });
  await fs.writeFile(path.join(replaceLive, 'keep2.txt'), 'keep2');
  const replaceZipPath = path.join(tmpRoot, 'replace.zip');
  await fs.writeFile(replaceZipPath, makeZip([['fresh2.txt', 'fresh2']]));

  try {
    const mergeResult = await extractAndMergeArchive(mergeZipPath, parentDir, {
      liveDirName: 'merge-channel',
      extractOptions: {},
    });
    assert.deepEqual(mergeResult.relPaths, ['fresh.txt']);
    assert.equal(await fs.readFile(path.join(mergeLive, 'keep.txt'), 'utf8'), 'keep me');
    assert.equal(await fs.readFile(path.join(mergeLive, 'fresh.txt'), 'utf8'), 'fresh');
    const mergeStats = await calculateDirectoryStats(mergeLive);
    assert.equal(mergeStats.fileCount, 2);
    assert.equal(mergeStats.storageBytes, Buffer.byteLength('keep me') + Buffer.byteLength('fresh'));

    await extractAndSwapArchive(replaceZipPath, parentDir, {
      liveDirName: 'replace-channel',
      extractOptions: {},
    });
    await assert.rejects(fs.access(path.join(replaceLive, 'keep2.txt')));
    assert.equal(await fs.readFile(path.join(replaceLive, 'fresh2.txt'), 'utf8'), 'fresh2');
    const replaceStats = await calculateDirectoryStats(replaceLive);
    assert.equal(replaceStats.fileCount, 1);
    assert.equal(replaceStats.storageBytes, Buffer.byteLength('fresh2'));

    const leftovers = (await fs.readdir(parentDir)).filter((name) => (
      name.startsWith('.asset-tmp-') || name.startsWith('.asset-old-')
    ));
    assert.deepEqual(leftovers, []);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('mergeArchiveTree moves nested files into the live tree and removes the temp dir', async () => {
  const tmpRoot = await mkTmp();
  const tempDir = path.join(tmpRoot, 'temp');
  const liveDir = path.join(tmpRoot, 'live');
  await fs.mkdir(path.join(tempDir, 'nested'), { recursive: true });
  await fs.writeFile(path.join(tempDir, 'nested', 'file.txt'), 'nested content');
  await fs.mkdir(liveDir, { recursive: true });

  try {
    const moved = await mergeArchiveTree(tempDir, liveDir);
    assert.deepEqual(moved.map((file) => file.relative), ['nested/file.txt']);
    assert.equal(await fs.readFile(path.join(liveDir, 'nested', 'file.txt'), 'utf8'), 'nested content');
    await assert.rejects(fs.access(tempDir));
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('listDirectoryFiles paginates and reports hasMore', async () => {
  const tmpRoot = await mkTmp();
  for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt']) {
    await fs.writeFile(path.join(tmpRoot, name), name);
  }

  try {
    const first = await listDirectoryFiles(tmpRoot, { offset: 0, limit: 2 });
    assert.deepEqual(first.files.map((file) => file.path), ['a.txt', 'b.txt']);
    assert.equal(first.hasMore, true);
    for (const file of first.files) {
      assert.equal(typeof file.size, 'number');
      assert.ok(!Number.isNaN(Date.parse(file.modifiedAt)));
    }

    const last = await listDirectoryFiles(tmpRoot, { offset: 4, limit: 2 });
    assert.deepEqual(last.files.map((file) => file.path), ['e.txt']);
    assert.equal(last.hasMore, false);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('calculateDirectoryStats sums bytes, counts files, and flags unhashed bundles', async () => {
  const tmpRoot = await mkTmp();
  await fs.mkdir(path.join(tmpRoot, 'WebGL'), { recursive: true });
  await fs.writeFile(path.join(tmpRoot, 'WebGL', 'assets_all_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.bundle'), Buffer.alloc(10));
  await fs.writeFile(path.join(tmpRoot, 'WebGL', 'assets_all.bundle'), Buffer.alloc(20));
  await fs.writeFile(path.join(tmpRoot, 'WebGL', 'catalog.json'), Buffer.alloc(5));

  try {
    const stats = await calculateDirectoryStats(tmpRoot);
    assert.equal(stats.fileCount, 3);
    assert.equal(stats.storageBytes, 35);
    assert.equal(stats.unhashedBundleCount, 1);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('acquireAssetReplaceLock serializes callers per key and allows other keys concurrently', () => {
  const locks = new Map();
  const releaseLive = acquireAssetReplaceLock('game:live', locks);
  assert.equal(typeof releaseLive, 'function');
  assert.equal(acquireAssetReplaceLock('game:live', locks), null, 'a second acquire on the same key must fail');

  const releaseBeta = acquireAssetReplaceLock('game:beta', locks);
  assert.equal(typeof releaseBeta, 'function', 'a different key must acquire independently');

  releaseLive();
  const releasedAgain = acquireAssetReplaceLock('game:live', locks);
  assert.equal(typeof releasedAgain, 'function', 'the key becomes available again after release');
  releasedAgain();
  releaseBeta();
});

test('sweepSwapArtifacts removes only directories matching the given prefixes', async () => {
  const tmpRoot = await mkTmp();
  await fs.mkdir(path.join(tmpRoot, '.content-tmp-abc'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, '.content-old-def'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, 'live'), { recursive: true });
  await fs.writeFile(path.join(tmpRoot, '.content-tmp-file'), 'not a directory');

  try {
    await sweepSwapArtifacts(tmpRoot, ['.content-tmp-', '.content-old-']);
    const remaining = (await fs.readdir(tmpRoot)).sort();
    assert.deepEqual(remaining, ['.content-tmp-file', 'live']);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('sweepSwapArtifacts is a no-op for a missing parent directory', async () => {
  const missing = path.join(os.tmpdir(), `asset-archive-missing-${Date.now()}`);
  await assert.doesNotReject(sweepSwapArtifacts(missing, ['.content-tmp-']));
});

test('assetArchiveError attaches a status code that defaults to 413', () => {
  const defaulted = assetArchiveError('boom');
  assert.equal(defaulted.status, 413);
  assert.equal(defaulted.message, 'boom');

  const custom = assetArchiveError('nope', 400);
  assert.equal(custom.status, 400);
});

test('wrapper stripping requires one shared wrapper directory', async () => {
  const tmpRoot = await mkTmp();
  const wrapperNames = ['serverdata', 'streamingassets'];
  try {
    // Two different wrapper trees in one zip must not be flattened into a
    // shared path space — that would collide same-named files and drop one.
    const mixedZip = path.join(tmpRoot, 'mixed.zip');
    const mixedDest = path.join(tmpRoot, 'mixed-dest');
    await fs.writeFile(mixedZip, makeZip([
      ['ServerData/WebGL/a.bundle', 'remote'],
      ['StreamingAssets/WebGL/a.bundle', 'local'],
    ]));
    const mixed = await extractArchive(mixedZip, mixedDest, { wrapperNames });
    assert.deepEqual(mixed.relPaths.sort(), [
      'ServerData/WebGL/a.bundle',
      'StreamingAssets/WebGL/a.bundle',
    ]);

    // A lone root-level file named after a wrapper would strip to an empty
    // path and be dropped, so it must keep its name instead.
    const bareZip = path.join(tmpRoot, 'bare.zip');
    const bareDest = path.join(tmpRoot, 'bare-dest');
    await fs.writeFile(bareZip, makeZip([['ServerData', 'not a directory']]));
    const bare = await extractArchive(bareZip, bareDest, { wrapperNames });
    assert.deepEqual(bare.relPaths, ['ServerData']);

    // The ordinary single-wrapper zip still gets stripped.
    const wrappedZip = path.join(tmpRoot, 'wrapped.zip');
    const wrappedDest = path.join(tmpRoot, 'wrapped-dest');
    await fs.writeFile(wrappedZip, makeZip([['ServerData/WebGL/a.bundle', 'remote']]));
    const wrapped = await extractArchive(wrappedZip, wrappedDest, { wrapperNames });
    assert.deepEqual(wrapped.relPaths, ['WebGL/a.bundle']);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
