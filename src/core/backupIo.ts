import { buildBackup, missingSites, parseBackup } from './backup';
import { hostOf } from './url';
import { send } from './messages';
import type { AppState } from './types';

/** Save the whole library and settings as a JSON file download. */
export function downloadBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify(buildBackup(state), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `manga-sync-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a backup file and merge it into the library. Resolves to a message for the user. */
export async function importBackupFile(file: File, state: AppState | null): Promise<string> {
  const backup = parseBackup(await file.text());
  const reply = await send({ type: 'IMPORT_DATA', mangas: backup.mangas, settings: backup.settings });
  if (!reply.ok) throw new Error(reply.error ?? 'Import failed');
  const subscribed = state?.sites.map((s) => s.origin) ?? [];
  const missing = missingSites(backup.mangas, subscribed).map(hostOf);
  let text = `Imported: ${reply.added ?? 0} added, ${reply.updated ?? 0} updated.`;
  if (missing.length > 0) text += ` Subscribe again to: ${missing.join(', ')}.`;
  return text;
}
