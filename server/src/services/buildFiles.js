import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { isAddressablesCatalogFilename } from './addressablesPatterns.js';

const THUMB_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const BLOG_IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
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

// `pipe` does not forward source errors, so a read failure mid-response would
// otherwise surface as an unhandled 'error' event and take the process down.
export function streamFile(filePath, res, next, options) {
  const stream = createReadStream(filePath, options);
  stream.on('error', (error) => {
    if (res.headersSent) res.destroy(error);
    else next(error);
  });
  stream.pipe(res);
}

// RFC 9110: If-Modified-Since must be ignored when If-None-Match is present.
// Honoring both would return 304 on an ETag miss whenever the file changed
// twice within the same second, since Last-Modified only has second precision.
function isNotModified(req, etag, mtimeMs) {
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch !== undefined) return matchesEtag(ifNoneMatch, etag);
  const ifModifiedSince = req.headers['if-modified-since'];
  const parsed = typeof ifModifiedSince === 'string' ? Date.parse(ifModifiedSince) : NaN;
  return !Number.isNaN(parsed) && parsed >= Math.floor(mtimeMs / 1000) * 1000;
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

        if (isNotModified(req, etag, stat.mtimeMs)) {
          return res.status(304).end();
        }
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }

      res.setHeader('Content-Length', stat.size);
      streamFile(filePath, res, next);
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

      const isCatalog = isAddressablesCatalogFilename(base) || base.toLowerCase().endsWith('.hash');
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
        if (isNotModified(req, etag, stat.mtimeMs)) {
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
        streamFile(filePath, res, next, { start: range.start, end: range.end });
        return;
      }

      res.setHeader('Content-Length', stat.size);
      streamFile(filePath, res, next);
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
      streamFile(filePath, res, next);
    } catch (err) {
      next(err);
    }
  };
}

// Blog media lived inline in index.js when the other static handlers moved
// here, which is how it ended up calling a `createReadStream` that index.js no
// longer imported — a ReferenceError that surfaced as a 500 on every image.
// Keeping it beside its siblings makes it testable and keeps the shape shared.
export function createBlogImageFileHandler(blogImageRoot) {
  return async (req, res, next) => {
    try {
      const filename = req.params.filename;
      if (!filename || filename.includes('..') || filename.includes('/')) return res.status(400).end();
      const filePath = path.join(blogImageRoot, filename);
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        return res.status(404).end();
      }
      if (!stat.isFile()) return res.status(404).end();

      const ext = filename.split('.').pop().toLowerCase();
      res.setHeader('Content-Type', BLOG_IMAGE_MIME[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Length', stat.size);
      streamFile(filePath, res, next);
    } catch (err) {
      next(err);
    }
  };
}
