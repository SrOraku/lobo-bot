# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — integração RP

Esta integração adiciona o novo **100 Lobisomens Estratégia + RP** por um plugin. O ponto de entrada, o Baileys, o SQLite, as sessões, as dependências e os comandos originais do repositório continuam em uso. O addon não abre outra conexão com o WhatsApp.

Nome exibido: **🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑**. Descrição: 🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

Desenvolvedor: **🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺**. Dono do bot: **+5543920030769**. A pasta de entrega é `Lobo-bot-v1/`; o nome técnico do pacote continua `lobo-bot`.

## Comandos e compatibilidade

O prefixo acompanha `PREFIX` do bot. Os exemplos abaixo usam `!`:

| Comando | Destino |
| --- | --- |
| `!menu` | Menu original seguido do menu do addon. |
| `!menu alcateia` ou `!alcateia menu` | Menu do novo jogo e RP. |
| `!alcateia perfil` ou `!perfilalcateia` | Perfil do novo jogo. |
| `!alcateia loja` ou `!lojaalcateia` | Loja dos novos lobisomens. |
| `!alcateia comprar 1` ou `!compraralcateia 1` | Compra na loja dos novos lobisomens. |
| `!start`, `!treino`, `!formacao`, `!ataque`, `!rank`, `!clan`, `!evento`, `!admin` | Novo jogo, quando esses nomes estão livres no bot. |
| `!rp`, `!profissoes`, `!profissao`, `!trabalhar`, `!acao`, `!carteira`, `!transferir` | RP e carteira compartilhada dos novos jogos. |
| `!rploja`, `!rpcomprar`, `!inventario`, `!usar`, `!familia` | Loja, inventário e família RP. |

Qualquer comando do addon também pode ser chamado pelo namespace: `!alcateia comando argumentos`. Caso uma atualização do bot ocupe um dos nomes diretos, o comando original tem prioridade. O addon mantém esse acesso pelo namespace.

Os comandos antigos **`!perfil`/`!profile`, `!loja`/`!shop` e `!comprar`/`!buy`** continuam com a função original. Também são preservados `!atacar`, `!estrategia`, `!lobos`, `!daily`, `!gold`, transferências antigas, moderação, mídia, figurinhas, XP e plugins. Os menus das categorias antigas continuam com o conteúdo original.

Os comandos dos novos jogos passam pelo fluxo original de mensagens, proteções e bloqueios globais do bot. O addon também verifica banimento/mute pelos identificadores de telefone e LID confiáveis. Seus limites de 1 comando por segundo e 50 por hora são persistentes e valem nos dois jogos novos. Os dois administradores do jogo são `5543996375955` e `5543920030769`; isso não concede permissões adicionais sobre o bot legado.

## Duas economias preservadas

**WOK Coin é a carteira única do novo 100 Lobisomens Estratégia e do novo RP.** As duas lojas novas usam esse mesmo saldo. Não há outro bônus por ativar o RP quando o jogador já está registrado na alcateia.

O **Gold legado** continua no SQLite original e mantém os comandos, preços e recompensas existentes. Não foi convertido, somado ou substituído por WOK Coin. Uma eventual conversão exigirá regras de migração próprias; esta integração não faz essa alteração silenciosamente.

## Arquivos e atualização

- Plugin CommonJS: `plugins/alcateia-rp.js`.
- Módulos ESM isolados: `addons/alcateia/src/`; `addons/alcateia/package.json` define o escopo ESM sem alterar o tipo do pacote principal.
- Dados novos: `storage/alcateia/database.json`.
- Backups novos: `storage/alcateia/backups/`, automaticamente a cada 6 horas com o bot em execução, ou por `!admin backup`.
- O SQLite legado continua em `data/lobo.db`; a sessão continua em `sessions/`.

Para atualizar uma instalação, pare o processo, guarde cópias dos dados e copie somente os arquivos de código deste addon e o plugin. Preserve `.env`, `sessions/`, `data/`, `storage/alcateia/` e os demais caminhos de uso existentes. Inicie com o comando habitual do projeto. Nenhuma dependência extra é instalada pelo addon.

O arquivo de backup é um envelope com `version`, `createdAt` e `data`. Para restaurar os jogos novos, pare o bot, preserve o arquivo atual e salve **o objeto `data`** do backup como `storage/alcateia/database.json`. Essa restauração não altera o SQLite ou as sessões legadas.

## Verificação local

```bash
npm test
```

Os testes do adaptador não importam o ponto de entrada do bot, SQLite ou Baileys e não conectam ao WhatsApp. O carregamento e as ações reais no WhatsApp ainda dependem da instalação e do pareamento existentes. O plugin reutiliza o socket fornecido pelo bot.

Não distribua diretórios pessoais ou de autenticação que possam estar presentes no checkout, como `.ssh/`, `.config/`, `.npm/`, históricos de terminal ou sessões. Eles não são necessários para este addon.
