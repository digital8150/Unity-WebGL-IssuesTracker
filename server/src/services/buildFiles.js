import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';

const THUMB_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

function baseMime(filename) {
  if (filename.endsWith('.wasm')) return 'application/wasm';
  if (filename.endsWith('.data')) return 'application/octet-stream';
  if (filename.endsWith('.js')) return 'application/javascript';
  if (filename.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

function isStreamingSwapArtifactPath(filename) {
  return filename.split(/[\\/]+/).some((segment) => (
    segment.startsWith('.streaming-assets-tmp-')
    || segment.startsWith('.streaming-assets-old-')
  ));
}

function matchesEtag(header, etag) {
  if (header === '*') return true;
  if (typeof header !== 'string') return false;
  const normalize = (value) => value.trim().replace(/^W\//, '');
  const normalizedEtag = normalize(etag);
  return header.split(',').some((value) => normalize(value) === normalizedEtag);
}

export function createBuildFileHandler(storageRoot) {
  return async (req, res, next) => {
    try {
      const filename = req.params[0];
      if (!filename || filename.includes('..')) return res.status(400).end();
      if (isStreamingSwapArtifactPath(filename)) return res.status(404).end();

      const filePath = path.join(storageRoot, req.params.buildId, filename);
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        return res.status(404).end();
      }
      if (!stat.isFile()) return res.status(404).end();

      const bare = filename.replace(/\.(br|gz)$/, '');
      const encoding = filename.endsWith('.br') ? 'br' : filename.endsWith('.gz') ? 'gzip' : null;
      res.setHeader('Content-Type', baseMime(bare));
      if (encoding) res.setHeader('Content-Encoding', encoding);

      const isStreamingAsset = bare === 'StreamingAssets' || bare.startsWith('StreamingAssets/');
      if (isStreamingAsset) {
        const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', stat.mtime.toUTCString());

        const ifModifiedSince = req.headers['if-modified-since'];
        const parsedIfModifiedSince = typeof ifModifiedSince === 'string' ? Date.parse(ifModifiedSince) : NaN;
        const notModifiedSince = !Number.isNaN(parsedIfModifiedSince)
          && parsedIfModifiedSince >= Math.floor(stat.mtimeMs / 1000) * 1000;
        if (matchesEtag(req.headers['if-none-match'], etag) || notModifiedSince) {
          return res.status(304).end();
        }
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }

      createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  };
}

export function createThumbnailFileHandler(thumbnailRoot) {
  return async (req, res, next) => {
    try {
      const filename = req.params.filename;
      if (!filename || filename.includes('..') || filename.includes('/')) return res.status(400).end();
      const filePath = path.join(thumbnailRoot, filename);
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        return res.status(404).end();
      }
      if (!stat.isFile()) return res.status(404).end();

      const ext = filename.split('.').pop().toLowerCase();
      res.setHeader('Content-Type', THUMB_MIME[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  };
}
