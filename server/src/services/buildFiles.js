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

function contentMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.hash')) return 'text/plain';
  if (lower.endsWith('.bundle') || lower.endsWith('.bin')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function isAssetSwapArtifactPath(filename) {
  return filename.split(/[\\/]+/).some((segment) => (
    segment.startsWith('.streaming-assets-tmp-')
    || segment.startsWith('.streaming-assets-old-')
    || segment.startsWith('.content-tmp-')
    || segment.startsWith('.content-old-')
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
      if (isAssetSwapArtifactPath(filename)) return res.status(404).end();

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

      res.setHeader('Content-Length', stat.size);
      createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  };
}

const CONTENT_CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

function parseContentRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || ''));
  if (!match) return null;

  const [, startText, endText] = match;
  if (size === 0) return { unsatisfiable: true };

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { unsatisfiable: true };
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }

  const start = Number(startText);
  if (!Number.isSafeInteger(start) || start >= size) return { unsatisfiable: true };
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return { unsatisfiable: true };
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function contentFilePath(contentRoot, gameId, channel, filename) {
  if (!/^[a-f0-9]{24}$/i.test(String(gameId || ''))) return null;
  if (!CONTENT_CHANNEL_PATTERN.test(String(channel || ''))) return null;
  if (!filename || filename.includes('..') || filename.includes('\\')) return null;
  const root = path.resolve(contentRoot, String(gameId), String(channel));
  const filePath = path.resolve(root, ...String(filename).split('/'));
  if (!filePath.startsWith(root + path.sep)) return null;
  return filePath;
}

export function createContentFileHandler(contentRoot) {
  return async (req, res, next) => {
    try {
      const filename = req.params[0];
      const filePath = contentFilePath(contentRoot, req.params.gameId, req.params.channel, filename);
      if (!filePath) return res.status(400).end();
      if (isAssetSwapArtifactPath(filename)) return res.status(404).end();

      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        return res.status(404).end();
      }
      if (!stat.isFile()) return res.status(404).end();

      const bare = filename.replace(/\.(br|gz)$/, '');
      const base = path.posix.basename(bare);
      const encoding = filename.endsWith('.br') ? 'br' : filename.endsWith('.gz') ? 'gzip' : null;
      res.setHeader('Content-Type', contentMime(base));
      res.setHeader('Accept-Ranges', 'bytes');
      if (encoding) res.setHeader('Content-Encoding', encoding);

      const isCatalog = /^catalog.*\.(json|bin|hash)$/i.test(base) || base.toLowerCase().endsWith('.hash');
      const isHashed = /[0-9a-f]{32}/i.test(base);
      const revalidates = isCatalog || !isHashed;
      if (isCatalog) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (isHashed) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }

      if (revalidates) {
        const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', stat.mtime.toUTCString());
        const ifModifiedSince = req.headers['if-modified-since'];
        const parsedIfModifiedSince = typeof ifModifiedSince === 'string' ? Date.parse(ifModifiedSince) : NaN;
        const notModifiedSince = !Number.isNaN(parsedIfModifiedSince)
          && parsedIfModifiedSince >= Math.floor(stat.mtimeMs / 1000) * 1000;
        if (matchesEtag(req.headers['if-none-match'], etag) || notModifiedSince) {
          return res.status(304).end();
        }
      }

      const range = parseContentRange(req.headers.range, stat.size);
      if (range?.unsatisfiable) {
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }
      if (range) {
        const length = range.end - range.start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
        res.setHeader('Content-Length', length);
        createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
        return;
      }

      res.setHeader('Content-Length', stat.size);
      createReadStream(filePath).pipe(res);
    } catch (error) {
      next(error);
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
      res.setHeader('Content-Length', stat.size);
      createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  };
}
