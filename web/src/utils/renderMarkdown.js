import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createBlogMarkdownRenderer } from './blogMedia.js';

marked.setOptions({ breaks: true, gfm: true });

/** Render stored blog/game markdown with the same media policy everywhere. */
export function renderMarkdown(raw) {
  const html = marked.parse(raw || '', { renderer: createBlogMarkdownRenderer(marked.Renderer) });
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe', 'source', 'video'],
    ADD_ATTR: [
      'allow', 'allowfullscreen', 'aria-hidden', 'aria-label', 'autoplay',
      'frameborder', 'height', 'loop', 'muted', 'playsinline', 'preload',
      'scrolling', 'src', 'type', 'width',
    ],
  });
}

export default renderMarkdown;
