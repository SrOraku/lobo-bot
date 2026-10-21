import fs from 'node:fs';
import path from 'node:path';

export function defaultGroup() {
  return {
    enabled: true, adminOnly: false, welcome: false, goodbye: false,
    antilink: false, antiflood: false, rules: '', welcomeText: '', goodbyeText: '',
    warnings: {}, warnLimit: 3,
  };
}

export function defaultGame() {
  return { version: 1, players: {}, clans: {}, duels: {}, battles: [], rateLimits: {},
    rp: { families: {}, invites: {}, history: [] } };
}

export class Store {
  constructor(file) {
    this.file = file;
    this.gameQueue = Promise.resolve();
    this.data = { version: 1, groups: {} };
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.version !== 1 || !data.groups || typeof data.groups !== 'object' || Array.isArray(data.groups)) {
        throw new Error('Banco de dados inválido. Restaure um backup de data/database.json.');
      }
      this.data = data;
    }
    if (!this.data.game) this.data.game = defaultGame();
    const game = this.data.game;
    if (game.version !== 1 || !Array.isArray(game.battles)) throw new Error('Dados do jogo inválidos. Restaure um backup.');
    for (const field of ['players', 'clans', 'duels', 'rateLimits']) {
      if (!game[field] || typeof game[field] !== 'object' || Array.isArray(game[field])) {
        throw new Error(`Dados do jogo inválidos: ${field}. Restaure um backup.`);
      }
    }
    game.duels = {};
    if (game.rp === undefined) game.rp = { families: {}, invites: {}, history: [] };
    if (!game.rp || typeof game.rp !== 'object' || Array.isArray(game.rp) ||
        !game.rp.families || typeof game.rp.families !== 'object' || Array.isArray(game.rp.families) ||
        !game.rp.invites || typeof game.rp.invites !== 'object' || Array.isArray(game.rp.invites) ||
        !Array.isArray(game.rp.history)) throw new Error('Dados RP inválidos. Restaure um backup.');
  }

  group(id) {
    if (!id.endsWith('@g.us')) throw new Error('ID de grupo inválido.');
    if (!this.data.groups[id]) this.data.groups[id] = defaultGroup();
    const group = this.data.groups[id];
    for (const [key, value] of Object.entries(defaultGroup())) {
      if (group[key] === undefined) group[key] = value;
    }
    return group;
  }

  groups() { return Object.entries(this.data.groups); }

  transactionGame(callback) {
    const pending = this.gameQueue.then(async () => {
      const draft = structuredClone(this.data.game);
      const result = await callback(draft);
      const previous = this.data.game;
      this.data.game = draft;
      try { this.save(); }
      catch (error) { this.data.game = previous; throw error; }
      return structuredClone(result);
    });
    this.gameQueue = pending.catch(() => {});
    return pending;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }
}
