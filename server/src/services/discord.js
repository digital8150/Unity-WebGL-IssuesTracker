const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

export async function sendDiscordNotification(issue) {
  if (!WEBHOOK) return;

  const exception = (issue.logs ?? []).find((l) => l.type === 'Exception');
  const snippet = exception
    ? `\`\`\`\n${truncate(exception.message ?? '', 400)}\n${truncate(exception.stackTrace ?? '', 600)}\n\`\`\``
    : null;

  const fields = [
    { name: 'Product', value: issue.productName || 'Unknown', inline: true },
    { name: 'Version', value: issue.version || 'n/a', inline: true },
    { name: 'Unity', value: issue.unityVersion || 'n/a', inline: true },
    { name: 'Browser', value: truncate(issue.browser?.userAgent || 'n/a', 200) },
  ];
  if (issue.browser?.webgl?.renderer) {
    fields.push({ name: 'GPU', value: truncate(issue.browser.webgl.renderer, 200) });
  }
  if (snippet) {
    fields.push({ name: 'Exception', value: snippet });
  }

  const embed = {
    title: `🐛 ${truncate(issue.title, 240)}`,
    description: truncate(issue.description || '(no description)', 1500),
    color: 0xd33d3d,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: `issue ${issue._id}` },
  };

  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

function truncate(s, n) {
  if (!s) return s;
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
