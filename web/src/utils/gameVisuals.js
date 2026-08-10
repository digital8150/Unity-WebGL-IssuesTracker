const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const GRADIENTS = [
  'linear-gradient(135deg, #007cf0, #00dfd8)',
  'linear-gradient(135deg, #7928ca, #ff0080)',
  'linear-gradient(135deg, #ff4d4d, #f9cb28)',
  'linear-gradient(135deg, #00dfd8, #7928ca)',
  'linear-gradient(135deg, #f9cb28, #ff4d4d)',
];

export function gradientFor(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export function assetUrl(path = '') {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

export function artworkFor(game) {
  return game?.thumbnailUrl
    ? assetUrl(game.thumbnailUrl)
    : gradientFor(game?.slug || game?.name || 'game');
}
