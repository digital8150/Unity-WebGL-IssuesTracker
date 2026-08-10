export const FIXED_GLOSSARY = Object.freeze([
  'BCSDLab.',
  'BCSDLab. Arcade',
  'BCSDLab. Game Track',
  'Unity',
  'WebGL',
  'GRAC',
]);

export function buildGlossary(gameNames = []) {
  return [...new Set([...FIXED_GLOSSARY, ...gameNames.map((name) => String(name || '').trim()).filter(Boolean)])]
    .sort((a, b) => b.length - a.length);
}
