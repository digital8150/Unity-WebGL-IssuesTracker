import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function findTestFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTestFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.test.js') ? [entryPath] : [];
  }));
  return nested.flat();
}

const files = (await findTestFiles(path.resolve('test'))).sort();
if (!files.length) throw new Error('No test files found');

const child = spawn(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  windowsHide: true,
});

child.once('error', (error) => {
  throw error;
});
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
