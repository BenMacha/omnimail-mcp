/**
 * Référence stable d'un message : compte + dossier + UID.
 * Format : "<compte>|<dossier encodé>|<uid>".
 */
export interface MessageRef {
  accountId: string;
  folder: string;
  uid: number;
}

export function encodeRef(ref: MessageRef): string {
  return `${ref.accountId}|${encodeURIComponent(ref.folder)}|${ref.uid}`;
}

export function decodeRef(value: string): MessageRef {
  const [accountId, folder, uid] = value.split("|");
  const n = Number(uid);
  if (!accountId || folder === undefined || !Number.isInteger(n)) {
    throw new Error(`Référence de message invalide : ${value}`);
  }
  return { accountId, folder: decodeURIComponent(folder), uid: n };
}

/** Regroupe des références par compte puis par dossier. */
export function groupRefs(refs: MessageRef[]): Map<string, Map<string, number[]>> {
  const out = new Map<string, Map<string, number[]>>();
  for (const r of refs) {
    const byFolder = out.get(r.accountId) ?? new Map<string, number[]>();
    const uids = byFolder.get(r.folder) ?? [];
    uids.push(r.uid);
    byFolder.set(r.folder, uids);
    out.set(r.accountId, byFolder);
  }
  return out;
}
