function fenceMarker(line) {
  const match = String(line).match(/^\s{0,3}(`{3,}|~{3,})/);
  return match ? { char: match[1][0], length: match[1].length } : null;
}

export function splitMarkdown(markdown, maxChars = 12000) {
  const text = String(markdown ?? '');
  const limit = Math.max(1, Number(maxChars) || 12000);
  if (text.length <= limit) return [text];
  const lines = text.split('\n');
  const blocks = [];
  let current = [];
  let fence = null;
  const flush = () => {
    if (current.length) blocks.push(current.join('\n'));
    current = [];
  };
  for (const line of lines) {
    if (!fence && line.trim() === '') {
      flush();
      continue;
    }
    const marker = fenceMarker(line);
    if (!fence && marker) fence = marker;
    current.push(line);
    if (fence && marker && marker.char === fence.char && marker.length >= fence.length && current.length > 1) fence = null;
  }
  flush();

  const normalizedBlocks = [];
  for (const block of blocks) {
    if (block.length <= limit || fenceMarker(block.split('\n')[0])) {
      normalizedBlocks.push(block);
      continue;
    }
    let part = '';
    for (const line of block.split('\n')) {
      const candidate = part ? `${part}\n${line}` : line;
      if (part && candidate.length > limit) {
        normalizedBlocks.push(part);
        part = line;
      } else {
        part = candidate;
      }
    }
    if (part) normalizedBlocks.push(part);
  }

  const chunks = [];
  let chunk = '';
  for (const block of normalizedBlocks) {
    const candidate = chunk ? `${chunk}\n\n${block}` : block;
    if (chunk && candidate.length > limit) {
      chunks.push(chunk);
      chunk = block;
    } else {
      chunk = candidate;
    }
  }
  if (chunk || !chunks.length) chunks.push(chunk);
  return chunks;
}

export function precedingContext(markdown, count = 200) {
  return String(markdown ?? '').slice(-Math.max(0, count));
}
