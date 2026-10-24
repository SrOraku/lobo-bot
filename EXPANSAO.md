# Expansão modular v1.7.0

## Auditoria realizada antes da implementação

A base era Node.js/Baileys, better-sqlite3 em WAL, migrations 1–12, registry com proteção contra colisões, SQLite isolado por chat e integração RP/Alcateia. A carteira já havia sido unificada como WoK coin. Já existiam 64 profissões, trabalho horário, escudo de batalha, XP/Premium, boost XP 3×, títulos, daily, eventos lunares, cinco minijogos persistentes, Akinator local, autorespostas simples, transcrição Bronxys e atualizador com staging/backup/recuperação de aplicação interrompida. Não foram recriados.

Foram consultados somente a árvore e os scripts públicos `atualizar.sh` e `start.sh` de Salientekill/ESDEATH-RUST. Eles documentam troca por rename, manifesto assinado, três minutos em teste e rollback depois de três quedas. O binário não foi executado, descompilado ou copiado. Recursos internos de jogo não podem ser verificados nesses scripts.

Conflitos resolvidos: `!trabalhar` continua sendo a profissão RP; `!pagar @pessoa VALOR` continua transferindo moedas, enquanto `!pagar divida VALOR` quita empréstimo. `!matilha` já era alias de `!lobos`: preserva a consulta antiga e acrescenta atividade coletiva. `!atividadegrupo` consulta somente o bônus. Os atalhos de menu não substituem `!gartic` nem `!conquistas`.

## Base e migração

Migration **13**, exclusivamente aditiva: progressão, conquistas, atividade diária, investimentos, empréstimos, histórico financeiro, deduplicação, sessões coletivas, histórico do desafio diário, configurações e autorespostas. As tabelas existentes e os dados de RP/Alcateia permanecem. Não há migration destrutiva. Sessões e `.env` não são sobrescritos.

Regras padrão em `src/config/expansion.js`. Personalizações opcionais em `data/game-config.json` são mescladas em memória com os defaults, sem apagar valores do dono. Novas chaves recebem defaults. Configuração inválida impede inicialização. Reinicie após editar o arquivo. Datas de atividade/eventos usam `America/Sao_Paulo` por padrão; configure `timezone` para mudar. Cooldowns continuam sendo durações persistentes.

## Progressão

- `!conquistas`, `!conquista ID`, `!trofeus`: 12 conquistas baseadas em dados existentes, com data e recompensa única. Não foi inventado troféu de duelos: esse modo já havia sido removido na versão anterior.
- `!carreira`, `!emprego`, `!salario`: progressão Estagiário–CEO sobre a profissão RP atual. Cargo depende de dias trabalhados e nível RP; o nível é `1 + floor(sqrt(experiência RP)/10)`.
- `!trabalhar`: mantém salário-base, cooldown de uma hora, energia, saciedade e regras da profissão. Acrescenta bônus do cargo, sequência de dias e boost salarial quando houver. Cenas que terminam em multa não recebem bônus positivo.
- `!streak`/`!sequencia`: dias distintos de uso do bot, sequência atual e último dia. Bônus de XP em 3/5/10/20 dias. Também mostra sequências de dias de treino/eventos e vitórias consecutivas da Alcateia, persistidas no jogador. Cooldowns existentes permanecem.
- `!boosts`, `!boost`, `!comprarboost ID`: XP 1,5×/2×, salário +25%, treino +20%, redução de 10% do cooldown de treino e reset do daily limitado a uma vez a cada 24h. O boost XP 3× já existente continua válido; prevalece o maior multiplicador de XP pessoal, sem multiplicar boosts pessoais entre si.
- O perfil principal exibe os efeitos ativos. O boost econômico afeta salários RP; não multiplica transferências, empréstimos ou resgates.

## Finanças exclusivamente virtuais

Toda movimentação utiliza a WoK coin universal existente, transação e evento idempotente permanente. Comandos financeiros novos exigem um número PN confirmado; identidades LID ainda não resolvidas devem aguardar sincronização ou usar o privado. Não há dinheiro real.

- `!investir QUANTIDADE`: mínimo 100, máximo 1.000.000; uma aplicação aberta por jogador/chat.
- `!investimentos`: principal, dias completos, rendimento e taxa.
- `!sacarinvestimento`: resgate único; juros simples de 0,5% por dia completo, até 30 dias; taxa de 1% no valor resgatado. Tudo configurável.
- `!banco`, `!divida`: situação e dez operações recentes.
- `!emprestimo QUANTIDADE`: 100–5.000, taxa virtual única de 5%, prazo de sete dias. Não acumula juros ilimitados nem remove dados após vencer.
- `!pagardivida QUANTIDADE` ou `!pagar divida QUANTIDADE`: pagamento parcial ou integral; não permite pagar acima da dívida.
- Uma dívida ativa impede abrir investimento e vice-versa. Não impede o uso normal dos comandos existentes.
- `!escudo`, `!comprarescudo`: Escudo Wolf econômico, 300 WoK coin por 24h, cooldown persistente de 24h. Impede perdas de moeda nas batalhas antigas e novas; não impede dano, multa pessoal RP, compras ou pagamentos voluntários. O escudo de batalha anterior é outro efeito e continua disponível.

## Comunidade e eventos

`!atividadegrupo`/`!matilha`: 5/10/20/50 jogadores distintos no dia rendem bônus coletivo de XP de 1,2×/1,5×/2×/2,5×. Privado não recebe bônus coletivo. O conjunto muda automaticamente a cada data local, sem cron destrutivo.

`!eventos`: eventos por horário/dia configurados centralmente. Por padrão: noturno 22h–6h (1,2× XP), happy hour 18h–19h em dias úteis (1,5×), fim de semana (1,2×). O maior bônus de evento é combinado com streak e matilha, limitado a 4× nesta camada. Premium/boost pessoal continuam aplicados separadamente. A avaliação é automática ao ganhar XP, sem anunciar horários falsamente ou criar spam de mensagens.

`!surpresa [RESPOSTA]`: desafio de emojis diário com dois minutos, intervalo de três segundos por tentativa, primeiro acerto único, histórico persistente e recompensa de 50 WoK coin +20 XP. Pontuação entra em `!rankingjogos`. Não há aposta.

## Jogos e Gartic

O registry descobre os arquivos em `src/games/modules/`; cada módulo possui start/view/advance. Os cinco jogos anteriores continuam no engine e não foram substituídos.

Novos: `!2048`, `!anagrama`, `!cacapalavras`, `!memoria`, `!matematica`, `!velha`, `!batalhanumeros`, `!reacao`, `!digitacao`, `!ppt`/`!jokenpo`. `!jogar NOME [resposta]`, `!jogos` e `!rankingjogos` dão acesso ao catálogo e ao ranking persistente por chat. Pontos comuns de arcade não são moeda. Nenhum jogo novo exige aposta ou compra de entrada.

`!gartic iniciar [1–10]`: o bot envia uma palavra ao desenhista no privado; ele desenha e envia a imagem ao grupo. Outros jogadores respondem no grupo ou por `!gartic PALAVRA`. `!gartic pista`, `status`, `proxima`, `parar` e `ranking`. Rodadas de dois minutos, encerramento automático, persistência e retomada dos timers após conexão. Primeiro acerto recebe 40 WoK coin, 20 XP e 30 pontos. Desenhista não ganha por revelar a própria palavra. O registro de pontos é o ranking compartilhado de minijogos.

O **Akinator continua local**, com o catálogo e as sessões já existentes, agora expostas por serviço próprio e expiradas após dez minutos. Nenhuma API externa de Akinator foi inventada ou adicionada sem endpoint público verificado. Damas e desenho automático por IA não foram implementados.

## Automação

`!autoresposta add MODE GATILHO | RESPOSTA` e `!respostas ...`, para admin/dono. Modos: `contains`, `starts`, `ends`, `exact`, `regex`. `list`, `del ID`, `on ID`, `off ID`. Os antigos `!autoresposta on/off` continuam sendo ativação do grupo. Donos podem usar `global` antes da ação. Regex aceita somente padrões simples, sem grupos, alternância ou quantificadores potencialmente perigosos.

Respondendo a uma mídia: `!autoresposta add exact bom dia | audio` (ou image/video/sticker). O áudio é convertido em MP3. Essa mídia é armazenada por autorização do cadastro em `storage/autorespostas/`; ela não é temporária. Não há gravações de terceiros embutidas. Gatilho não responde ao próprio bot. Cooldown e chance estão no registro SQLite. Cadastro pelo chat usa 30s e 100%; valores personalizados podem ser importados no arquivo descrito abaixo.

Arquivo opcional `data/autorespostas.json`: lista de regras `{chat, mode, trigger, type, content, cooldown, chance}`; `chat: "*"` é global. É importado uma vez por conteúdo/reinício para o SQLite. Repetir o mesmo arquivo não duplica regras; versões editadas acrescentam regras sem apagar as existentes. Use `list`/`del` para retirar versões antigas. Conteúdo de mídia deve ser um nome de arquivo privado já cadastrado, sem caminhos externos. Não crie banco JSON paralelo.

`!antipv status/on/off/0/1/2/3/liberar NUMERO/remover NUMERO`, somente dono. Modos: desligado; avisar e permitir; avisar e ignorar; avisar e bloquear. Aviso limitado a um por dia. Donos e lista branca não são bloqueados. Identidade não resolvida pode ser ignorada, mas jamais bloqueada automaticamente.

`!perfildivertido`: perfil recreativo temporário que não altera o RP.

## Integrações opcionais

- `LASTFM_API_KEY`: `!musica`, `!artista`, `!album`, `!lastfm`. Consulta informação pública por endpoint fixo, não baixa mídia.
- `ASSEMBLYAI_API_KEY`: `!transcrever` usa upload/transcrição com polling e timeout; sem ela, mantém Bronxys. Áudio de até 8 MB, em memória, sem cópia permanente. O comando explícito autoriza envio ao serviço. O provedor externo possui sua própria política de retenção e cobrança.
- Nenhuma chave nova está incluída no repositório. Os testes dessas integrações usam clientes simulados; não houve validação ao vivo sem chaves configuradas.

## Atualizador e operação

`!atualizarbot` é atalho para o atualizador existente e continua exclusivo de donos; `!versao` lê package.json. `.version` é um espelho gerado, não outra fonte de versão editada manualmente.

`npm run release:manifest` gera SHA-256 de todos os arquivos gerenciados e `.version`; `npm run release:verify` detecta arquivos alterados ou novos ausentes do manifesto. O manifesto é conferido antes de executar npm/testes no staging. O download continua preso ao commit do repositório oficial. Releases antigas sem manifesto permanecem compatíveis no modo de commit fixo; com chave pública configurada, manifesto e assinatura passam a ser obrigatórios.

Assinatura Ed25519 é opcional: `LOBO_RELEASE_PRIVATE_KEY` apenas no ambiente de publicação e `LOBO_RELEASE_PUBLIC_KEY` no servidor confiável. Sem infraestrutura configurada, o estado é **UNSIGNED_DEVELOPMENT_MODE**; hashes não substituem uma assinatura de origem independente.

O supervisor mantém o pareamento no console. Crash inesperado recebe backoff 1/2/4/8… até 60s, no máximo cinco falhas em dez minutos. Após atualização, a versão fica pendente até o runtime sinalizar prontidão e permanecer três minutos ativo. Três saídas inesperadas durante o teste restauram o código/dependências anteriores e bloqueiam o commit problemático. Sessão, `.env` e banco não são revertidos; migrations desta versão são aditivas. O teste de saúde verifica vida/prontidão do processo, não garante disponibilidade de cada API externa ou conexão WhatsApp permanente.

É necessário **um reinício pelo painel ao instalar esta versão**, para carregar o supervisor novo no processo pai. O supervisor antigo já em memória não adquire funcionalidades apenas reiniciando o filho.

Logs: `bot.log`, `error.log`, `crash.log`, `update.log`, além do log datado existente. Registros novos possuem allowlist de campos e ocultam chaves configuradas e parâmetros secretos. Logs novos de lifecycle possuem rotação de 5 MB. Backups do código são mantidos até a confirmação de saúde; retenção de cinco versões. Temporários `lobo-media-*` e `lobo-bronxys-*` abandonados há mais de 24h são limpos; sessões, dados e outros temporários não são tocados.

## Limites e compatibilidade

Gold é apenas o nome legado de comandos/colunas; a moeda continua **WoK coin universal por chat**. Não foram removidos RPG, clãs, famílias, lojas, rankings, moderação, mídia ou dados anteriores. Duelos não existiam como modo ativo na edição auditada e não foram reintroduzidos como função fictícia. Nenhuma regra interna do binário ESDEATH foi presumida.

## Resultado da validação

Foram executados lint, verificação de sintaxe, suíte de testes e startup sem conexão ao WhatsApp em Node 22 e Node 24. Há testes novos para finanças/rollback/idempotência, conquistas, streaks, carreira, boosts, escudo, módulos de jogo, Gartic, desafio diário, autorespostas, anti-PV, integrações simuladas, SHA-256, Ed25519, prontidão/rollback e backoff. O relatório final da entrega informa a contagem efetivamente aprovada.

Não houve conexão a grupos reais nem envio de áudios/imagens ao WhatsApp durante a validação. Não há chave Last.fm/AssemblyAI nem chave privada de assinatura configuradas nesta entrega. A assinatura foi testada com um par Ed25519 temporário de teste, não usada para declarar a release de produção assinada.

Validação final desta entrega: **506 testes aprovados em cada versão Node 22.23.3 e 24.19.0**, lint/sintaxe/startup e manifesto aprovados. Auditoria: 207 comandos e 18 categorias.
