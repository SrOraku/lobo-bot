# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

## RP e WOK Coin — atualização 3.1

O bot existente continua com seus comandos, sessão e banco de dados. O plugin adiciona **64 profissões, família, 19 itens e uma carteira WOK Coin compartilhada entre o novo RP e o novo 100 Lobisomens Estratégia**. Os duelos foram retirados; o ataque direto continua.

```text
!rp iniciar
!rp perfil
!profissoes
!carteira
!alcateia menu
```

Aguarde pelo menos 1 segundo entre comandos dos jogos. As lojas novas estão em `!rploja` e `!lojaalcateia`; ambas gastam WOK Coin. Os comandos antigos `!perfil`, `!loja`, `!comprar` e o Gold original são preservados. Use `!perfilalcateia` e `!compraralcateia 1` para o novo jogo. **Gold legado não foi convertido em WOK Coin.**

Leia [a integração e atualização](addons/alcateia/INTEGRACAO.md), [as profissões e famílias RP](addons/alcateia/RP.md) e [as regras da alcateia](addons/alcateia/JOGO.md). O nome técnico do pacote é `lobo-bot`; o nome exibido mantém os símbolos. Para personalizar uma instalação com `.env` já existente, confira `BOT_NAME` e `BOT_DESCRIPTION`; a atualização preserva esses valores configurados.

Verificação local, sem conectar ao WhatsApp:

```bash
npm test
```


> Bot WhatsApp multifuncional com **100 Lobisomens** + **LOBO-BOT V3**  
> Construído com Node.js + Baileys Multi-Device

**Dev:** 🌹♆̽Ø᩺Ɍͬ₳Ꮶび♆̶❒᭄꥓〭 🐺  
**Contato:** +55 43 92003-0769 | +55 43 99637-5955

---

## ⚡ Instalação Rápida

```bash
# 1. Entrar na pasta
cd lobo-bot

# 2. Instalar dependências
npm install

# 3. Configurar
cp .env.example .env
nano .env        # coloque seu número em BOT_OWNER

# 4. Iniciar
npm start
```

---

## 📱 Termux (Android)

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git python make clang

cd ~ && unzip lobo-bot.zip -d lobo-bot && cd lobo-bot
npm install
cp .env.example .env && nano .env

# Rodar em background com tmux
pkg install tmux
tmux new -s lobo
npm start
# Sair sem fechar: Ctrl+B, D
# Voltar: tmux attach -t lobo
```

---

## 🖥️ PM2 (Produção)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup
pm2 logs lobo-bot
```

---

## 🐳 Docker

```bash
cp .env.example .env && nano .env
docker-compose up -d
docker-compose logs -f lobo-bot
```

---

## 🗂️ Estrutura

```
lobo-bot/
├── src/
│   ├── index.js               # Entrada principal
│   ├── config/
│   │   ├── index.js           # Validação de config
│   │   ├── logger.js          # Logger estruturado
│   │   └── migrations.js      # Migrations do banco
│   ├── core/
│   │   ├── commandRegistry.js # Registry central de comandos
│   │   ├── eventBus.js        # Barramento de eventos
│   │   ├── pluginLoader.js    # Carregador de plugins
│   │   └── response.js        # Respostas padronizadas
│   ├── middlewares/
│   │   ├── permissions.js     # Níveis de permissão
│   │   └── rateLimit.js       # Anti-flood
│   ├── services/
│   │   └── index.js           # Lógica de negócio
│   ├── commands/              # Módulos de comandos
│   ├── handlers/              # Handlers de eventos
│   └── utils/                 # Utilitários
├── plugins/                   # Plugins dinâmicos
├── data/lobo.db               # SQLite (auto-criado)
├── sessions/                  # Sessão WhatsApp
├── logs/                      # Logs estruturados
├── .env                       # Configurações
├── Dockerfile
├── docker-compose.yml
└── ecosystem.config.js        # PM2
```

---

## 🔌 Criar um Plugin

Crie um arquivo em `plugins/meu-plugin.js`:

```js
module.exports = {
  name: 'meu-plugin',
  version: '1.0.0',
  description: 'Meu plugin personalizado',
  commands: {
    'meucomando': async (sock, ctx) => {
      await sock.sendMessage(ctx.jid, { text: 'Olá do plugin! 🐺' }, { quoted: ctx.msg });
    },
  },
  onLoad: async (sock) => { console.log('Plugin carregado!'); },
};
```

---

## 🐺 100 Lobisomens — Comandos

| Comando | Descrição |
|---------|-----------|
| `!mudar estrategia ataque:X defesa:Y contra:Z` | Distribuir 100 lobos |
| `!atacar @usuário` | Batalha! |
| `!lobos` | Ver sua matilha |
| `!curarlobos` | Curar (200 Gold) |
| `!ranklobos` | Ranking |
| `!infolobos` | Guia completo |

---

## 🛡️ Níveis de Permissão

| Nível | Nome | Acesso |
|-------|------|--------|
| 0 | 🐾 Membro | Comandos básicos |
| 1 | 🌙 Admin do Grupo | Moderação |
| 2 | 🐺 Admin do Bot | Recursos avançados |
| 3 | 👑 Dono da Matilha | Tudo |

---

## ❗ Erros Comuns

| Erro | Solução |
|------|---------|
| `better-sqlite3` falha | `npm install --build-from-source better-sqlite3` |
| `sharp` falha | `npm install --ignore-scripts sharp` |
| Sem permissão `/sdcard` | `termux-setup-storage` |
| Node < 18 | `pkg install nodejs-lts` |
| Sessão expirada | Delete `sessions/` e reinicie |

---

_Fiel como o lobo • Bela como a rosa • Estratégico como o alfa_ 🌹🐺  
**🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ sempre ao seu lado!**
