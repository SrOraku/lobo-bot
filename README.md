> **Atualização pelo WhatsApp — v1.8.6:** `!atualizar bot` aplica os arquivos e pede reinício mesmo se o aviso no WhatsApp falhar. Um reinício pendente pode ser concluído repetindo o comando, sem reinstalação ou exclusão de dados.

> **Console e conexão — v1.8.5:** comandos dos grupos voltam a aparecer no console, com status ONLINE e reconexão após pareamento. Suas alterações de menus e mídias foram preservadas.

> **Correção v1.8.3:** download de atualizações com retentativas limitadas, fallback oficial por blob e diagnóstico por arquivo; divergência de manifesto é informada como falha de integridade.

> **Correção v1.8.2:** `!ban` remove o participante do grupo e mantém o bloqueio interno somente após confirmação do WhatsApp. `!kick` continua removendo sem bloquear comandos.

> **Correção v1.8.1:** recuperação automática de travas de atualização abandonadas, sem apagar sessão ou banco.

> **v1.8.0 — LOBO SECURITY:** [proteções por grupo, confiança, auditoria, snapshots e limites reais](src/security/groups/README.md). Jogos, RP e economia permanecem intactos.

> **Expansão v1.7.0:** [auditoria, comandos, migrations, compatibilidade e limites](EXPANSAO.md). WoK coin permanece a moeda única por chat.

> **Atualização v1.6.0:** no Lobo Bot integrado, Gold e WOK Coin foram unificados como **WoK coin**. Os saldos antigos são somados uma única vez, na proporção 1:1, por jogador e chat. Economia, RP e Alcateia usam a mesma carteira SQLite. Os comandos antigos continuam válidos; `!carteira`, `!saldo` e `!wok` consultam o saldo universal. Referências históricas abaixo à separação das moedas descrevem versões anteriores. O addon executado isoladamente continua usando seu armazenamento JSON.

# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

## Inicialização com atualização

No painel Bronxys, você pode usar **`bash atualizar.sh`** como comando de inicialização, na raiz que contém package.json. Ele verifica a versão oficial, usa staging/validação/backup do atualizador existente e inicia o supervisor com a sessão e os dados atuais. Se já estiver atualizado, inicia diretamente; se a rede falhar antes da aplicação, inicia a versão local preservada. Travas de processos comprovadamente encerrados são recuperadas automaticamente. Se houver aplicação interrompida, o backup é validado e restaurado antes de iniciar. Uma atualização ativa, trava inválida ou falha de restauração continua impedindo iniciar por segurança. `npm start` continua disponível para iniciar sem a verificação remota.

## API Bronxys

Downloads, pesquisas, IA e efeitos do catálogo fornecido foram integrados. Consulte [configuração privada, comandos e limites](BRONXYS.md). Nenhuma chave é publicada no GitHub.

## Edição atual

A versão oficial é definida em [package.json](package.json) e exibida dinamicamente por `!ping`. Consulte [a modernização e seus limites](MODERNIZACAO.md).

Novos sistemas: `!donos`, capa de foto/GIF por `!fotomenu`, emissão autorizada de moedas por `!doarwok` e controle de informações de grupo por `!adm perm`. Consulte [comandos, limites e funcionamento](MENUS.md). O antirroubo depende de privilégios e eventos do WhatsApp; não garante impedir tomada de grupos.

## Atualização automática — v1.2.0

`!setores` é informativo; categorias não podem mais ser desativadas. As proteções de grupo continuam em `!ativacoes`. O inicializador `node src/index.js` permite que `!atualizar bot` aplique arquivos e reinicie o processo WhatsApp automaticamente, reutilizando a sessão. A primeira instalação desta edição requer um reinício pelo painel. Atualizações só de código reutilizam dependências após verificação; bloqueios da hospedagem continuam sendo informados com segurança.

## Segurança — v1.0.1

Diretórios pessoais foram retirados da árvore atual e bloqueados no Git e no contexto Docker. Isso **não remove os commits antigos nem revoga credenciais**. Consulte [as ações necessárias na conta e a limpeza de histórico](SECURITY.md). Docker agora executa sem root; revise as permissões dos volumes antes de atualizar. A CI verifica Node 22 e 24.

## Jogos da edição v1

A numeração pública foi ajustada para a série v1, mantendo todas as melhorias e os dados das edições anteriores. `!ping` exibe a versão atual do pacote.

O menu Jogos ganhou `!quiz`, `!forca`, `!adivinhar`, `!aventura` e `!placarjogos`. Partidas persistentes, conquistas e ranking são separados por chat. O Akinator agora utiliza respostas para filtrar 18 personagens em vez de sortear uma hipótese. O evento lunar ganhou cenas de exploração. Pontos dos minijogos não alteram Gold ou WOK Coin. Consulte [regras e comandos](MENUS.md).

## Progresso independente por grupo

Perfis, Gold, WOK Coin, níveis, rankings, lobos, RP, clãs, famílias e cooldowns agora são separados por chat. O progresso anterior é copiado como ponto de partida de cada grupo uma única vez, conforme autorizado; mudanças seguintes não atravessam os grupos. O privado também é independente. Veja [migração e funcionamento do isolamento](ISOLAMENTO.md).

## Menus organizados

`!menu` mostra o usuário e 15 categorias; os dados técnicos ficam em `!ping`. Use `!menu jogos`, `!menu alcateia`, `!menu midia`, `!menu adm`, `!menu dono`, `!menu util`, `!menu figurinhas`, `!menu pesquisa`, `!menu ia`, `!menu diversao`, `!menu grupo`, `!menu info`, `!menu ferramentas`, `!menu rp` ou `!menu economia`. Os nomes das categorias também funcionam como atalhos; as rotas antigas de RP e alcateia continuam disponíveis. `!play nome/link` envia MP3 diretamente; `!play video nome/link` envia MP4. Os demais comandos de áudio/vídeo são `!play_audio nome/link` e `!play_video nome/link`, preservando `!ytmp3` e `!ytmp4`. Veja a [auditoria, classificação e validação dos menus](MENUS.md).

## Atualização por comando

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

## Ativações por grupo — 3.5.0

Use `!ativacoes` dentro do grupo para consultar os setores. O dono pode usar `!ativacoes midia off`, `!ativacoes jogos membros`, `!ativacoes rp adm` ou `!ativacoes bot off/on`. Para autorizar os administradores daquele grupo a configurar um setor: `!ativacoes delegar midia on` (revogar com `off`). Cada grupo mantém sua própria configuração após reiniciar.

O dono permanece em `BOT_OWNER`; donos adicionais podem ser configurados em `BOT_OWNERS`, com números completos separados por vírgula. O número conectado não vira dono automaticamente. Se ele estiver na lista de donos, seus próprios comandos também são aceitos, sem processar as respostas normais do bot em loop. Administradores comuns não se tornam donos nem podem delegar controles, alterar o setor Dono ou conceder poderes administrativos a membros. Ligar um setor mantém as permissões, registros, saldos e cooldowns originais. Os administradores fixos dos jogos são preservados.

Pausar o bot pelo painel de ativações bloqueia comandos de função para outros usuários naquele grupo; a navegação e o próprio painel continuam disponíveis para recuperação. A pausa não remove o bot, não fecha o grupo e não desliga as proteções automáticas de moderação nem os eventos de entrada/saída.

## Ativações centralizadas — 3.6.0

`!ativacoes status`, `!ativar recurso`, `!desativar recurso`, `!ativar tudo` e `!desativar tudo` usam o mesmo registro de 32 recursos por grupo. ON/OFF e 1/0 também são aceitos nos comandos de proteção e boas-vindas. Estados antigos são migrados para o SQLite existente, com cache e auditoria transacional. Veja [recursos, permissões, migração e limites da referência](ATIVACOES.md).
