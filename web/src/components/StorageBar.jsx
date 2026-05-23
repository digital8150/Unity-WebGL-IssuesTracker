import React, { useEffect, useState } from 'react';
import { getUsage } from '../api.js';

function fmtBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function useStorageUsage() {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    getUsage()
      .then(setUsage)
      .catch(() => {});
  }, []);

  return usage;
}

export default function StorageBar({ label }) {
  const usage = useStorageUsage();

  if (!usage) return null;

  const { usedBytes, quotaBytes } = usage;
  const pct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;
  const warn = pct >= 80;
  const crit = pct >= 95;

  return (
    <div className="storage-bar-wrap">
      {label && <div className="storage-bar-label">{label}</div>}
      <div className="storage-bar-track">
        <div
          className={`storage-bar-fill${crit ? ' crit' : warn ? ' warn' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="storage-bar-numbers">
        <span>{fmtBytes(usedBytes)}</span>
        <span>{fmtBytes(quotaBytes)}</span>
      </div>
    </div>
  );
}
