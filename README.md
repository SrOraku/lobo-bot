# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

## Menus organizados — versão 3.4

`!menu` agora mostra apenas os dados do bot e 15 categorias. Use `!menu jogos`, `!menu alcateia`, `!menu midia`, `!menu adm`, `!menu dono`, `!menu util`, `!menu figurinhas`, `!menu pesquisa`, `!menu ia`, `!menu diversao`, `!menu grupo`, `!menu info`, `!menu ferramentas`, `!menu rp` ou `!menu economia`. Os nomes das categorias também funcionam como atalhos; as rotas antigas de RP e alcateia continuam disponíveis. Os comandos de áudio/vídeo são `!play_audio nome/link` e `!play_video nome/link`, preservando `!ytmp3` e `!ytmp4`. Veja a [auditoria, classificação e validação dos menus](MENUS.md).

## Atualização por comando — versão 3.3

Somente o dono configurado pode usar `!atualizar status`, `!atualizar bot` e `!atualizar baileys` (respeitando o prefixo configurado). O primeiro mostra versões; o segundo busca este repositório em `main`; o terceiro verifica a versão mais recente publicada pelo projeto oficial WhiskeySockets/Baileys. A versão atual é `7.0.0-rc14`.

A atualização prepara e verifica os arquivos antes de substituir o código, mantém backup em `updates/` e preserva `.env`, sessões e dados dos jogos. Funciona também em instalações por ZIP. Após concluir, **reinicie pelo painel** para carregar a atualização. O Node é atualizado pelo painel do servidor, com mínimo **22.12**. Para receber estes comandos pela primeira vez, instale esta versão via GitHub ou ZIP.

## RP e WOK Coin

O bot existente continua com seus comandos, sessão e banco de dados. O plugin adiciona **64 profissões, família, 19 itens e uma carteira WOK Coin compartilhada entre o novo RP e o novo 100 Lobisomens Estratégia**. Os duelos foram retirados; o ataque direto continua.

Identidade padrão: **🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑**. Desenvolvedor: **🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺**. Dono do bot: **+5543920030769**. Em instalações com `.env` existente, confira `BOT_NAME`, `DEVELOPER_NAME` e `BOT_OWNER` para usar esses valores. Os pacotes de download usam a pasta `Lobo-bot-v1`.

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
npm run check:startup
```

Use Node.js 22.12 ou superior (validado no Node 22.23.3). Se o painel executar diretamente `node src/index.js` sem dependências instaladas, o bot instala os pacotes de produção antes de iniciar. A primeira instalação usa o `package-lock.json` do projeto e pode levar alguns minutos; os próximos inícios reutilizam os pacotes presentes.

O comando `check:startup` verifica as dependências reais, as APIs do Baileys, SQLite em memória, imagens e FFmpeg, sem conectar ao WhatsApp nem alterar a sessão ou o banco do bot.

> Bot WhatsApp multifuncional com **100 Lobisomens** + **LOBO-BOT V3**
> Construído com Node.js + Baileys Multi-Device

**Dev:** 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺

**Contato:** +5543920030769

---

## ⚡ Instalação Rápida

```bash
# 1. Entrar na pasta
cd Lobo-bot-v1

# 2. Instalar dependências
npm ci

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

cd ~ && unzip Lobo-bot-v1.zip && cd Lobo-bot-v1
npm ci
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
| `sharp` falha | Reinstale com `npm ci --include=optional` |
| Sem permissão `/sdcard` | `termux-setup-storage` |
| Node anterior a 22.12 | Configure Node.js 22 atualizado no painel |
| Sessão expirada | Delete `sessions/` e reinicie |

---

_Fiel como o lobo • Bela como a rosa • Estratégico como o alfa_ 🌹🐺
**🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ sempre ao seu lado!**
