import { GitHubSyncConfig } from '../types/project90';
import { exportFullDatabaseJSON, importFullDatabaseJSON } from '../db/database';

const STORAGE_KEY = 'project90_github_sync_config';

export function loadGitHubConfig(): GitHubSyncConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveGitHubConfig(cfg: GitHubSyncConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function encodeBase64Unicode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function decodeBase64Unicode(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function pushDatabaseToGitHub(cfg: GitHubSyncConfig): Promise<string> {
  const jsonContent = await exportFullDatabaseJSON();
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.filePath}`;

  let sha: string | undefined;
  const checkRes = await fetch(`${url}?ref=${cfg.branch}`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (checkRes.ok) {
    const existing = await checkRes.json();
    sha = existing.sha;
  }

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Project 90 Sync — ${new Date().toISOString()}`,
      content: encodeBase64Unicode(jsonContent),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err.message || `GitHub push failed (${putRes.status})`);
  }

  const now = new Date().toISOString();
  saveGitHubConfig({ ...cfg, lastSyncedAt: now });
  return now;
}

export async function pullDatabaseFromGitHub(cfg: GitHubSyncConfig): Promise<void> {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.filePath}?ref=${cfg.branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub pull failed (${res.status})`);
  }

  const data = await res.json();
  const decoded = decodeBase64Unicode(data.content);
  await importFullDatabaseJSON(decoded);
}
