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
    if(!this.data.games)this.data.games={};
    if (game.rp === undefined) game.rp = { families: {}, invites: {}, history: [] };
    if (!game.rp || typeof game.rp !== 'object' || Array.isArray(game.rp) ||
        !game.rp.families || typeof game.rp.families !== 'object' || Array.isArray(game.rp.families) ||
        !game.rp.invites || typeof game.rp.invites !== 'object' || Array.isArray(game.rp.invites) ||
        !Array.isArray(game.rp.history)) throw new Error('Dados RP inválidos. Restaure um backup.');
    if(!this.data.gameSeed)this.data.gameSeed=structuredClone(game);
    if(!this.data.games || typeof this.data.games!=='object' || Array.isArray(this.data.games))throw new Error('Dados isolados inválidos.');
    for(const scoped of [this.data.gameSeed,...Object.values(this.data.games)]) {
      if(scoped?.version!==1 || !Array.isArray(scoped.battles))throw new Error('Dados de jogo isolado inválidos.');
      for(const key of ['players','clans','duels','rateLimits'])if(!scoped[key]||typeof scoped[key]!=='object'||Array.isArray(scoped[key]))throw new Error('Dados de jogo isolado inválidos.');
      if(!scoped.rp||!scoped.rp.families||!scoped.rp.invites||!Array.isArray(scoped.rp.history))throw new Error('Dados RP isolados inválidos.');
    }
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

  scoped(chatId) {
    if(!/^\d+(?:-\d+)?@(?:g\.us|s\.whatsapp\.net|lid)$/.test(chatId))throw new Error('Chat inválido.');
    return {transactionGame:callback=>this.transactionGame(callback,chatId)};
  }

  transactionGame(callback,chatId=null) {
    const pending = this.gameQueue.then(async () => {
      const current=chatId?this.data.games[chatId]:this.data.game;
      const draft = structuredClone(current || this.data.gameSeed);
      const result = await callback(draft);
      const previous = current;
      if(chatId)this.data.games[chatId]=draft;else this.data.game = draft;
      try { this.save(); }
      catch (error) { if(chatId){if(previous)this.data.games[chatId]=previous;else delete this.data.games[chatId];}else this.data.game=previous; throw error; }
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
