import React from 'react';

/**
 * The BCSD club symbol, inlined from the official `BCSD Logo-symbol.svg`.
 *
 * Paths are verbatim. The upstream file styles them through a `<style>` block
 * with `.cls-1`/`.cls-2`/`.cls-3` class names — inlining that would leak those
 * names into the global stylesheet, so the fills are attributes instead.
 *
 * The body is `#1d1d1b` upstream, which disappears on a dark surface, so it
 * takes `currentColor`. The eyes are counter-wound holes in that path, so they
 * read as the backdrop showing through — the standard reverse treatment.
 *
 * `mono` flattens the two brand purples into `currentColor` as well, for
 * lockups that set the symbol in a single ink alongside the wordmark. Without
 * it the purples stay exactly as issued.
 */
export default function BcsdSymbol({ className = '', title, mono = false }) {
  const accent = (brand) => (mono ? 'currentColor' : brand);

  return (
    <svg
      className={className}
      viewBox="0 0 173.22 136.56"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      <path
        fill={accent('#d370f9')}
        d="M128.54,70.71c-8.97,4.75-20.68,9.49-35.18,13.93-14.5,4.43-26.86,7.05-36.96,8.13,7.6,8.56,18.68,13.96,31.03,13.96.9,0,1.79-.04,2.68-.1,3.42-.15,13.53-.57,24.1-.57,7.1,0,14.4.19,20.02.76,0,0-11.74-10.12-6.77-30.71.48-1.76.84-3.56,1.09-5.41"
      />
      <path
        fill={accent('#b611f5')}
        d="M46.31,59.79c-16.7,8.85-23.89,17.72-21.76,24.69,2.13,6.97,13.05,10.3,31.85,8.3-6.5-7.32-10.46-16.96-10.46-27.52,0-1.85.13-3.67.37-5.46Z"
      />
      <path
        fill={accent('#b611f5')}
        d="M150.31,46.02c-2.13-6.97-13.05-10.3-31.85-8.3,6.5,7.32,10.46,16.96,10.46,27.52,0,1.85-.13,3.67-.37,5.46,16.7-8.85,23.89-17.72,21.76-24.69Z"
      />
      <path
        fill="currentColor"
        d="M118.46,37.73c-7.6-8.56-18.68-13.96-31.03-13.96-21.06,0-38.44,15.69-41.11,36.02-.24,1.79-.37,3.61-.37,5.46,0,10.56,3.95,20.2,10.46,27.52,10.1-1.08,22.46-3.7,36.96-8.13,14.5-4.43,26.21-9.18,35.18-13.93.24-1.79.37-3.61.37-5.46,0-10.56-3.95-20.2-10.46-27.52ZM62.38,48.47c-1.93,0-3.5-1.57-3.5-3.5s1.57-3.5,3.5-3.5,3.5,1.57,3.5,3.5-1.57,3.5-3.5,3.5ZM75.66,48.47c-1.93,0-3.5-1.57-3.5-3.5s1.57-3.5,3.5-3.5,3.5,1.57,3.5,3.5-1.57,3.5-3.5,3.5Z"
      />
    </svg>
  );
}
