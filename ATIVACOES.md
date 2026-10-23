# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — Ativações 3.6.0

🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

## Uso

- `!ativacoes` ou `!ativacoes status`: painel gerado do registro, nome do grupo e estado de cada recurso.
- `!ativar RECURSO` / `!desativar RECURSO`: altera somente aquele grupo.
- `!ativar tudo`: recursos marcados como seguros; não liga expulsões nem filtros de moderação em massa.
- `!desativar tudo`: desliga opcionais, preservando o acesso ao painel e a proteção obrigatória contra abuso de comandos.
- `!antilink on`, `!antilink off`, `!antispam 1`, `!antispam 0`, `!bemvindo on`, `!despedida off`: mesmos registros, sem flags duplicadas.
- Comandos antigos sem argumentos, como `!antilink`, continuam alternando o estado. `!antilink delete/warn/kick` configura a ação; `!antiinatividade 7` configura os dias para limpeza manual.
- Exemplos de aliases: `!ativar anti-link`, `!ativar welcome`, `!desativar bye`, `!ativar antifigurinha`. Aliases que já eram comandos de outra função, como `!level`, `!xp` e `!autoreply`, conservam seu significado anterior. Nesses casos use `!ativar level`, `!ativar xp`, `!ativar autoreply`.
- O prefixo é o configurado, não necessariamente `!`.

Os controles anteriores de setores continuam: `!ativacoes rp adm`, `!ativacoes jogos membros`, `!ativacoes midia off`, `!ativacoes bot on/off`, `!ativacoes delegar midia on/off`. Administradores podem alterar os recursos administrativos, salvo restrição do dono; para setores do bot, continua necessária a delegação explícita. Só donos podem delegar, pausar o bot ou reservar setores aos donos. Habilitar um setor nunca substitui as permissões originais dos comandos. Conta conectada não recebe autoridade de dono automaticamente.

## Registro funcional — 32 recursos

**Moderação (16):** AntiLink, AntiLink de grupos/convites, AntiLink externo, AntiFake brasileiro, AntiContato, AntiMarcação excessiva, AntiSpam por repetição, AntiFlood de mensagens, AntiLocalização, AntiDocumento, AntiÁudio, AntiVídeo, AntiImagem, AntiSticker/AntiFigurinha, AntiViewOnce e habilitação da limpeza manual de inativos. Filtros usam remoção da mensagem; AntiFake mantém a remoção do participante e AntiLink mantém modos delete/warn/kick. O bot precisa ser administrador para ativar esses recursos. A limpeza de inativos continua sendo um comando explícito, sem expulsões automáticas em segundo plano.

**Grupo (3):** bem-vindo com a imagem existente, despedida e autorespostas cadastradas. AutoResposta habilitada não cria gatilhos: use o comando existente para cadastrá-los.

**Sistemas (2):** ganho de XP e aviso de nível. O aviso depende de XP. Desligar XP também desliga o aviso; reativar o aviso exige XP habilitado. Recompensas econômicas por mensagem respeitam o setor Economia.

**Setores (11):** Jogos, Alcateia, RP, Economia, Mídia, Figurinhas, Pesquisa, Diversão, Grupo, Info e Util. Não são incluídos setores vazios de IA/Ferramentas como funções fictícias. Recursos de dono e moderação mantêm seus controles especiais anteriores.

Novos filtros ficam OFF por padrão. Configurações já existentes são preservadas: welcome, goodbye, auto_reply, level_up_msg, antilink, antifake, anticontact, antitag e antiinactivity são migrados. Os padrões antigos de bem-vindo/despedida/autorespostas/aviso de nível continuam ON quando não havia escolha anterior. A proteção obrigatória de comandos mantém seu próprio limite de segurança; o AntiFlood opcional deste painel atua sobre mensagens do grupo.

AntiDelete, AutoSticker, AutoReact, AutoDownload e AntiPalavrão não são anunciados como implementados. Eles não tinham handlers/configurações completos no projeto e não foram preenchidos com funções vazias.

## Arquitetura, persistência e auditoria

`src/activations/registry.js` registra id, nome, descrição, categoria, padrão, aliases, permissão, dependências, necessidade de admin do bot e referência ao handler real. O painel e os comandos de ativação são gerados a partir dele.

`manager.js` fornece `isEnabled`, `enableFeature`, `disableFeature`, `toggleFeature`, `getGroupFeatures`, `getEnabledFeatures` e `getDisabledFeatures`, com validação de grupo, permissões e dependências. `store.js` usa o SQLite existente, sem criar outro banco. Há cache por JID, carregado na inicialização/reconexão; uma consulta aquecida não executa SQL. Alterações relêem a linha dentro de transação, persistem estado e auditoria e só então substituem o cache. Assim uma falha na gravação não publica estado inexistente em memória. A configuração é por grupo, não global.

A migração 5 preserva as colunas antigas, setores, delegações e dados dos usuários. As colunas antigas ficam como espelho de compatibilidade atualizado na mesma transação; os handlers de ativação redundantes foram substituídos por adaptadores ao gerenciador. O histórico `activation_audit` registra grupo, recurso, estado anterior, novo estado, identidade confirmada e horário. Nenhuma senha ou chave é necessária.

Configuração inválida é recusada sem sobrescrever a linha e sem bloquear grupos com configuração válida. A cache é local a um processo; não se propõe executar várias instâncias simultâneas sobre o mesmo banco. Atualizações e reinícios preservam as tabelas existentes.

`message-rules.js` trata envelopes e mídia sem legenda, incluindo ViewOnce e contatos múltiplos. O rastreador de spam/flood é limitado em memória e guarda hash do texto, não o texto completo. `handlers/protection.js`, `groupEvents.js`, `autoReply.js` e `xp.js` consultam a mesma API. A identidade vem do evento do WhatsApp e de metadados/mapeamentos PN/LID, não de nome de exibição nem flags enviadas pelo usuário.

## Comparação com a referência

Referência examinada: `https://github.com/Salientekill/ESDEATH-RUST`. A árvore pública contém instaladores Shell, configuração modelo, catálogos JSON e um executável. Não há código-fonte JS/TS/Rust público que permita percorrer o gerenciador interno de ativações. O executável não foi executado nem descompilado. Portanto não se afirma ter descoberto comandos, aliases, padrões, middleware, banco por grupo ou regras ON/OFF internos do Death/Esdeath.

Inventário verificável da referência:

| Elemento público | Evidência | Comando/alias/ON-OFF/permissão/handler |
| --- | --- | --- |
| Configuração global | Modelo com campos de nome, dono, criador e prefixo | Implementação interna não disponível |
| Boas-vindas e saída | Nomes de campos para fundos e API de boas-vindas | Não prova ativação por grupo ou padrão ON/OFF |
| AntiPV | Campo de modo e mensagens | Comandos, aliases, comportamento e permissões não verificáveis |
| Log do console | Campo de configuração | Handler e estado padrão não verificáveis |
| Serviços externos | Campos para integrações de terceiros | Não foram reutilizados endpoints, chaves ou credenciais |

Classificação no Lobo:

- **A — existentes:** grupos SQLite, donos/admins, AntiLink/Fake/Contato/Marcação, entrada/saída, respostas, XP/nível, setores de jogos e economia.
- **B — parciais corrigidos:** flags fora do painel; toggles sem ON/OFF explícito; filtros não chamados para mídia sem texto; identificação de bot admin por PN/LID; estado por grupo sem cache/auditoria; inatividade rotulada de forma ambígua.
- **C — implementação própria:** filtros de mídia/convites/ViewOnce, repetição e flood de mensagens, registry dinâmico, aliases, cache, migração e transações com auditoria.
- **D — não reproduzidos:** código interno fechado do executável, integrações/serviços privados e quaisquer segredos. Nenhum token, senha ou chave do bot de referência foi copiado.

## Validação

A suíte cobre ativar/desativar como admin/dono; recusa de membro; estados já iguais; recurso inexistente; isolamento entre grupos; migração/reabertura; banco em modo somente leitura; rollback/cache; necessidade de admin do bot; alterações próximas em campos diferentes; aliases; painel automático; proteção real de sticker sem texto; entrada/saída com participantes em formato objeto e string; preservação de papéis em ativação coletiva; configurações inválidas; dependências XP/nível e consultas em cache sem SQL. Os testes anteriores dos jogos, economia, RP, permissões e downloads continuam na suíte. Testes locais não equivalem a uma conexão ao WhatsApp real.

Resultado final: **327 testes aprovados no Node 22.23.3 e 327 no Node 24.19.0**, com diagnóstico de inicialização aprovado nos dois ambientes. Não houve alteração da biblioteca Baileys nem instalação de dependências novas para este sistema. A identidade oficial, sessão, usuários, Gold, WOK Coin, RPG/RP, Alcateia, clãs, menus e permissões originais foram preservados.
