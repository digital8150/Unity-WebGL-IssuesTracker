import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

export const BLOG_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const FFMPEG_TIMEOUT_MS = 2 * 60 * 1000;

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
}

function runFfmpeg(command, args) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    let settled = false;
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error('GIF conversion timed out');
      error.code = 'FFMPEG_TIMEOUT';
      finish(error);
    }, FFMPEG_TIMEOUT_MS);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('error', (error) => {
      if (error.code === 'ENOENT') error.code = 'FFMPEG_NOT_FOUND';
      finish(error);
    });

    child.once('close', (code) => {
      if (code === 0) return finish();
      const error = new Error(stderr.trim() || `FFmpeg exited with code ${code}`);
      error.code = 'FFMPEG_FAILED';
      finish(error);
    });
  });
}

/**
 * Convert an uploaded GIF into a browser-friendly H.264 MP4.
 * The output itself is configured by the caller's video element to autoplay,
 * loop, and remain muted, so no controls or audio track are needed here.
 */
export async function convertGifToMp4(buffer, outputPath) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bcsdlab-gif-'));
  const inputPath = path.join(tempRoot, 'input.gif');
  const tempOutputPath = path.join(tempRoot, 'output.mp4');

  try {
    await fs.writeFile(inputPath, buffer);
    await runFfmpeg(getFfmpegPath(), [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', inputPath,
      '-an',
      '-vf', 'scale=ceil(iw/2)*2:ceil(ih/2)*2:flags=lanczos,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-movflags', '+faststart',
      tempOutputPath,
    ]);
    await fs.copyFile(tempOutputPath, outputPath);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
