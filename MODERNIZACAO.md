# Modernização — v1.4.0

## Escopo real desta entrega

Esta versão implementa a base econômica prioritária e parte das fases de concorrência, registry, plugins e validação. **Não conclui todas as 57 seções solicitadas.** Não afirma capacidade para milhares de usuários sem teste de carga. As pendências estão discriminadas abaixo.

A arquitetura existente foi mantida: Baileys, better-sqlite3/WAL, SQLite com isolamento por chat, addon Alcateia/RP com sua fila e persistência transacional próprias, configurações, menus e atalhos. A análise incluiu package/README/SECURITY, migrations, database/isolation, registry, handlers, serviços, plugin Alcateia, ativações, updater e testes. Nenhum arquivo pessoal ou credencial foi consultado. Não foi reescrito histórico Git.

## Correções implementadas

- Gold: transferir agora cria o destinatário dentro da mesma transação, valida inteiro seguro positivo, impede autotransferência e saldo insuficiente, debita, credita e registra o movimento atomicamente. O saldo inicial padrão do usuário novo foi preservado (500 Gold). Uma falha no ledger desfaz inclusive a criação do destinatário.
- Idempotência: transferências, compras e daily feitos pelos handlers usam ID real da mensagem, isolado por chat, para evitar processamento repetido. Chamadas internas sem ID não ganham essa deduplicação automaticamente.
- Compras: débito, efeito e lançamento financeiro pertencem à mesma transação. IDs inválidos não cobram. Cura de lobos reutiliza esse serviço.
- Premium: novas compras duram sete dias; recompra soma sete dias ao restante. Verificação central considera expiração real, sem cron. Premium legado explicitamente sem data continua válido até nova compra/configuração; dados anteriores não são apagados.
- Boost XP: multiplicador 3× persistente por 24h. Premium e boost usam o maior multiplicador ativo, sem multiplicação acumulativa. Recompra prolonga a duração.
- Escudo: efeito persistente de três horas, consultado pelo ataque antigo e pelo WolfService. Não altera o balanceamento separado do novo jogo estratégico do addon.
- Títulos: Alfa da Lua é adquirido e equipado no SQLite. `!titulos` lista e `!titulo usar alfa-lua` equipa; perfil mostra o título equipado. A estrutura permite vários títulos por jogador/chat.
- Daily: recompensa e cooldown de 24h persistidos juntos; cache/Redis deixaram de ser fonte da verdade para essa recompensa.
- XP por mensagem: cooldown persistente usa XP_COOLDOWN_SEC; Premium e boost reais entram no ganho; erros relevantes são registrados. Cooldown, XP e recompensas são gravados em transação; o bônus de nível não depende do envio do aviso WhatsApp.
- Batalha do comando antigo: resultado, lobos, estatísticas, Gold e cooldown persistente gravados na mesma transação. Estratégias são relidas após o anúncio. Falha ao anunciar/liberar processamento não prende o conjunto de batalhas ativas. Registro da perda de Gold passou a acompanhar a perda efetiva.
- Fila: comandos críticos antigos serializados por chat; chats distintos continuam independentes. A fila tem limites de chaves/pendências e libera entradas após sucesso ou falha. O addon mantém sua fila original.
- SQL: updateGroup recusa nomes de colunas fora de whitelist explícita.
- Registry: colisões de nomes e aliases são recusadas antes da mutação; adaptadores legados e substituição de uma rota de menu usam política explícita. Carregamento de comandos é idempotente durante reconexões.
- Metadados: cooldown, rateLimit, cost, ownerOnly, adminOnly, premiumOnly, requiresBotAdmin, feature e concurrency=chat têm integração. hidden, timeout e auditLevel são metadados reservados; não constituem implementação completa de timeout/cancelamento/auditoria.
- Rate limiter complementar: orçamento por chat, usuário, comando, categoria pesada e custo; entradas expiram e têm limite de capacidade. Proteção antiga e quotas do addon continuam existindo. O orçamento complementar ainda não unifica os plugins.
- Plugins: validação compatível com modo legado, versão opcional, permissões declaradas, hooks e handlers; duplicatas são recusadas. Recarregar descarrega a instância anterior antes de onLoad. Permissões declaradas **não são sandbox** para JavaScript arbitrário.
- Configuração: validação adicional de MAX_RECONNECT, XP_COOLDOWN_SEC e NODE_ENV.
- Versão: package.json continua sendo a fonte usada por ping; README aponta para essa fonte.
- CI: preserva Node 22/24; adiciona ESLint nos módulos novos e auditoria não bloqueante. Não reformata nem declara o legado inteiro livre de lint.

## Migration

`11 — persistent_economy_effects` adiciona `user_effects`, `user_titles`, `persistent_cooldowns`, `economy_operations`. Chaves compostas começam pelo chat e usuário/evento. Não altera/destrói tabelas anteriores nem reseta jogadores, sessões, famílias ou moedas. Índices das chaves primárias atendem às consultas implementadas. Migrations foram executadas apenas em ambientes de validação; instalação aplica a migration no próximo boot.

## Arquivos

Alterados: `.github/workflows/ci.yml`, `README.md`, `package.json`, `package-lock.json`, `src/commands/gold.js`, `src/commands/stats.js`, `src/commands/wolf.js`, `src/config/index.js`, `src/config/migrations.js`, `src/core/commandRegistry.js`, `src/core/pluginLoader.js`, `src/handlers/commands.js`, `src/handlers/xp.js`, `src/middlewares/rateLimit.js`, `src/services/index.js`, `src/utils/database.js`, `src/updater/source.js`.

Criados: `eslint.config.js`, `src/services/economy.js`, `src/core/keyed-queue.js`, `src/core/plugin-contract.js`, `src/middlewares/command-limits.js`, testes `economy-transactions`, `keyed-queue`, `plugin-contract`, `command-limits`, `registry-collisions` e este relatório.

## Testes e comandos

- Novos testes: transferência, deduplicação, falha do ledger, concorrência, overflow/entrada inválida, Premium/extensão/expiração, boost, escudo, daily, título, isolamento de efeitos por chat e migration repetida; filas entre chats e falhas; limites; contratos de plugins e colisões de comandos.
- `npm ci` executado nos ambientes Node 22 e 24.
- `npm run check`: lint incremental, sintaxe, testes e startup sem conectar WhatsApp.
- 405 testes aprovados em cada ambiente Node 22 e 24. Houve uma falha transitória de desserialização no executor Node 22; o arquivo isolado e a suíte completa repetida passaram. Lint, sintaxe e startup também passaram nos dois ambientes.
- Registro real dos comandos carregado no ambiente de validação sem colisões; não houve conexão WhatsApp.
- `npm run docs` produz auditoria JSON do registry; não reescreve documentos automaticamente.
- `npm run security` encontrou 6 alertas: 5 altos e 1 moderado. Não foi executado audit fix --force, que inclui mudanças incompatíveis. É necessária revisão das cadeias afetadas.

## Limites e próximos trabalhos necessários

- Anti-raid, whitelist de links, limite configurável/unwarn, modlog paginado e expansão de moderação não foram implementados nesta versão; proteções e advertências existentes foram preservadas.
- Updater preservado com recuperação de aplicação interrompida da versão anterior. Não existe ainda health-check de três minutos, rollback automático pós-boot, manifesto Ed25519 ou bloqueio de releases ruins. O journal protege recuperação de aplicação; não comprova saúde da versão nova.
- Reconexão completa com geração/cleanup de todos os listeners, backoff exponencial, tratamento fatal supervisionado e ciclo formal de runtime continuam pendentes. Apenas registro de comandos e recarga de plugins receberam proteção nesta etapa.
- O serviço WolfService secundário ainda precisa de uma consolidação transacional completa da batalha; o comando antigo e o jogo estratégico do addon têm caminhos próprios. Cooldowns de treino/eventos/profissões do addon já persistem nele; não houve migração geral de todos os caches legados.
- Métricas/statusbot, logging/auditoria administrativa geral, retenção/integridade ampliadas dos backups e serviços/repositories para todas as regras antigas continuam pendentes.
- A contagem de eventos econômicos/efeitos ainda exige política de retenção para instalações muito grandes. Não apagar eventos indiscriminadamente: isso pode remover a proteção contra reprocessamento antigo.
- ESLint está restrito aos novos módulos críticos. A revisão de segurança de todas as URLs, processos e dependências não está completa.
- Não houve teste real no Bronxys, perda de energia, comunicação WhatsApp nem teste de carga. Redis não foi usado como requisito da economia nova.

Preservados: identidade, tema, menus, atalhos completos, APIs anteriores, bancos/dados existentes, sessões, isolamento por chat, RP, WOK/Gold, Alcateia, jogos e configurações. Isso não substitui validação real da instalação e backup antes de atualizar.
