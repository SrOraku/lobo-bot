import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class BackupManager {
  constructor({ store, directory, logger = console, intervalMs = 6 * 60 * 60_000, now = () => Date.now() }) {
    if (!store || typeof directory !== 'string' || !directory) throw new TypeError('Backup precisa de store e directory.');
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) throw new TypeError('Intervalo de backup inválido.');
    this.store = store;
    this.directory = path.resolve(directory);
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.now = now;
    this.timer = null;
    this.pending = Promise.resolve();
  }

  create() {
    const operation = this.pending.catch(() => {}).then(async () => {
      const at = this.now();
      // Allowlist persistent bot data so credentials added elsewhere never enter a backup.
      const source = this.store.snapshot ? this.store.snapshot() : this.store.data;
      const snapshot = {
        version: 1, createdAt: at,
        data: structuredClone({ version: source.version, groups: source.groups, game: source.game, gameSeed: source.gameSeed, games: source.games }),
      };
      const stamp = new Date(at).toISOString().replace(/[:.]/g, '-');
      const destination = path.join(this.directory, `lobo-game-${stamp}-${randomUUID()}.json`);
      const temporary = `${destination}.tmp`;
      let handle;
      try {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        handle = await fs.open(temporary, 'wx', 0o600);
        await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.rename(temporary, destination);
        return destination;
      } finally {
        if (handle) await handle.close().catch(() => {});
        await fs.unlink(temporary).catch(() => {});
      }
    });
    this.pending = operation.catch(() => {});
    return operation;
  }

  start() {
    if (this.timer) return this;
    this.timer = setInterval(() => {
      this.create().catch(error => this.logger.warn({ error: error.message }, 'Falha ao criar backup automático do jogo.'));
    }, this.intervalMs);
    this.timer.unref?.();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
