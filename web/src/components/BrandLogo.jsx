import React from 'react';

// Two-tone wordmark — "BCSDLab." in mute, "Arcade" in ink.
// Use `size="lg"` for landing-scale, default is nav-scale.
export default function BrandLogo({ size = 'md', className = '' }) {
  const sizes = {
    sm: { font: 14, gap: 4 },
    md: { font: 16, gap: 5 },
    lg: { font: 22, gap: 7 },
  };
  const s = sizes[size] || sizes.md;
  return (
    <span
      className={`brand-logo ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: s.gap,
        fontSize: s.font,
        fontWeight: 600,
        letterSpacing: '-0.03em',
        lineHeight: 1,
      }}
    >
      <span style={{ color: 'var(--color-mute)' }}>BCSDLab.</span>
      <span style={{ color: 'var(--color-ink)' }}>Arcade</span>
    </span>
  );
}
