export function gameTransitionName(slug = '') {
  const safeSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '-');
  return `game-art-${safeSlug || 'unknown'}`;
}

export function activateGameTransitionSource(element, name) {
  if (!element || typeof document === 'undefined') return;

  document.querySelectorAll('[data-game-transition-source="true"]').forEach((source) => {
    source.style.viewTransitionName = 'none';
    delete source.dataset.gameTransitionSource;
  });

  element.style.viewTransitionName = name;
  element.dataset.gameTransitionSource = 'true';
}
