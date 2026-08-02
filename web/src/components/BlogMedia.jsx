import React from 'react';
import { isVideoMediaUrl } from '../utils/blogMedia.js';

export function BlogMedia({ src, alt = '', className = '', loading = 'lazy' }) {
  if (isVideoMediaUrl(src)) {
    return (
      <video
        className={className}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        <source src={src} type="video/mp4" />
      </video>
    );
  }

  return <img src={src} alt={alt} className={className} loading={loading} />;
}
