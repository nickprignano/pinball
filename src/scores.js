// High scores kept on the player's device: the top 10 per table, each with 3-letter initials.
// If storage is blocked, the game still plays and just doesn't keep scores.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

const KEY = 'pinball-scores';
const MAX_SCORES = 10;

function loadAll(storage) {
  try {
    return JSON.parse(storage?.getItem(KEY) ?? 'null') ?? {};
  } catch {
    return {};
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class Scores {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
  }

  // [{ name, score, date }] for a table, best first.
  list(tableId) {
    return loadAll(this.storage)[tableId] ?? [];
  }

  best(tableId) {
    return this.list(tableId)[0]?.score ?? 0;
  }

  qualifies(tableId, score) {
    const list = this.list(tableId);
    return score > 0 && (list.length < MAX_SCORES || score > list[list.length - 1].score);
  }

  add(tableId, name, score) {
    const all = loadAll(this.storage);
    const initials = String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || '???';
    const list = [...(all[tableId] ?? []), { name: initials, score, date: new Date().toISOString().slice(0, 10) }];
    all[tableId] = list.sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
    try {
      this.storage.setItem(KEY, JSON.stringify(all));
    } catch {
      // Storage blocked or full: the score just isn't kept.
    }
    return all[tableId];
  }
}
