import { addressablesCatalogHashPath, isAddressablesCatalogFilename } from './addressablesPatterns.js';

function normalizedPath(file) {
  return String(file?.path ?? file ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
}

export function validateAddressablesLayout(files) {
  const paths = files.map(normalizedPath).filter(Boolean);
  const pathSet = new Set(paths.map((file) => file.toLowerCase()));
  const catalogs = paths.filter(isAddressablesCatalogFilename);
  const warnings = [];

  if (catalogs.length === 0) {
    warnings.push({ code: 'missing_catalog' });
  } else {
    const missingHashes = catalogs.filter((catalog) => (
      !pathSet.has(addressablesCatalogHashPath(catalog).toLowerCase())
    ));
    if (missingHashes.length > 0) {
      warnings.push({ code: 'missing_catalog_hash', paths: missingHashes });
    }
  }

  const misplacedCatalogs = catalogs.filter((catalog) => normalizedPath(catalog).split('/').length !== 2);
  const hasBuildTargetDirectory = paths.some((file) => normalizedPath(file).split('/').length >= 2);
  if (!hasBuildTargetDirectory || misplacedCatalogs.length > 0) {
    warnings.push({ code: 'missing_build_target_directory', paths: misplacedCatalogs });
  }

  return warnings;
}
