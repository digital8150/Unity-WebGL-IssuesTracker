const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const GRADIENTS = [
  'linear-gradient(135deg, #007cf0, #00dfd8)',
  'linear-gradient(135deg, #7928ca, #ff0080)',
  'linear-gradient(135deg, #ff4d4d, #f9cb28)',
  'linear-gradient(135deg, #00dfd8, #7928ca)',
  'linear-gradient(135deg, #f9cb28, #ff4d4d)',
];

// Sparks carry the brighter stop of the matching gradient and smoke the deeper
// one. Reading these in gradient order instead puts a dark spark over its own
// backdrop, which is why the hero flame was invisible against the artwork.
const FLAME_PALETTES = [
  { sparkColor: [0, 223 / 255, 216 / 255], smokeColor: [0, 124 / 255, 240 / 255] },
  { sparkColor: [1, 0, 128 / 255], smokeColor: [121 / 255, 40 / 255, 202 / 255] },
  { sparkColor: [249 / 255, 203 / 255, 40 / 255], smokeColor: [1, 77 / 255, 77 / 255] },
  { sparkColor: [0, 223 / 255, 216 / 255], smokeColor: [121 / 255, 40 / 255, 202 / 255] },
  { sparkColor: [249 / 255, 203 / 255, 40 / 255], smokeColor: [1, 77 / 255, 77 / 255] },
];

function gradientIndexFor(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % GRADIENTS.length;
}

export function gradientFor(seed = '') {
  return GRADIENTS[gradientIndexFor(seed)];
}

export function flamePaletteFor(seed = '') {
  return FLAME_PALETTES[gradientIndexFor(seed)];
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
