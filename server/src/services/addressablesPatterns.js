import path from 'node:path';

export const ADDRESSABLES_CATALOG_PATTERN = /^catalog.*\.(json|bin)$/i;
export const ADDRESSABLES_CATALOG_METADATA_PATTERN = /^catalog.*\.(json|bin|hash)$/i;

export function isAddressablesCatalogFilename(filename) {
  return ADDRESSABLES_CATALOG_PATTERN.test(path.posix.basename(String(filename || '')));
}

export function isAddressablesCatalogMetadataFilename(filename) {
  const base = path.posix.basename(String(filename || ''));
  return ADDRESSABLES_CATALOG_METADATA_PATTERN.test(base) || base.toLowerCase().endsWith('.hash');
}

export function addressablesCatalogHashPath(filename) {
  const value = String(filename || '').replaceAll('\\', '/');
  return /\.(json|bin)$/i.test(value) ? value.replace(/\.(json|bin)$/i, '.hash') : null;
}
