import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

const createStorage = () => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
};

const storage = createStorage();
beforeEach(() => {
  vi.stubGlobal('localStorage', storage);
  storage.clear();
});

afterEach(() => {
  cleanup();
  storage.clear();
});
