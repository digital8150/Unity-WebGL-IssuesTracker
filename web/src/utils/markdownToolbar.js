const CODE_DELIMITER = String.fromCharCode(96);

export const TOOLBAR_ACTIONS = [
  { id: 'h2',     label: 'H2',   wrap: ['## ', ''],           block: true  },
  { id: 'h3',     label: 'H3',   wrap: ['### ', ''],           block: true  },
  { id: 'bold',   label: 'B',    wrap: ['**', '**'],           block: false },
  { id: 'italic', label: 'I',    wrap: ['_', '_'],             block: false },
  { id: 'code',   label: CODE_DELIMITER, wrap: [CODE_DELIMITER, CODE_DELIMITER], block: false },
  { id: 'codebl', label: '{}',   wrap: [`${CODE_DELIMITER.repeat(3)}\n`, `\n${CODE_DELIMITER.repeat(3)}`], block: true },
  { id: 'link',   label: '🔗',   wrap: ['[', '](url)'],        block: false },
  { id: 'ul',     label: '• ',   wrap: ['- ', ''],             block: true  },
  { id: 'ol',     label: '1.',   wrap: ['1. ', ''],            block: true  },
  { id: 'quote',  label: '❝',    wrap: ['> ', ''],             block: true  },
  { id: 'hr',     label: '—',    insert: '\n\n---\n\n',       block: true  },
  { id: 'img',    label: '🖼',    wrap: ['![alt](', ')'],       block: false },
];

export function applyToolbarAction(textarea, action) {
  const { selectionStart: s, selectionEnd: e, value } = textarea;
  const selected = value.slice(s, e);

  let newText;
  let newCursorStart;
  let newCursorEnd;

  if (action.insert) {
    newText = value.slice(0, s) + action.insert + value.slice(e);
    newCursorStart = s + action.insert.length;
    newCursorEnd = newCursorStart;
  } else {
    const [before, after] = action.wrap;
    newText = value.slice(0, s) + before + selected + after + value.slice(e);
    newCursorStart = s + before.length;
    newCursorEnd = newCursorStart + selected.length;
  }

  return { newText, newCursorStart, newCursorEnd };
}
