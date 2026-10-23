# Auditoria e reforço — v1.3.2

Esta entrega é uma etapa implementada da reconstrução solicitada. Não representa conclusão de todos os 44 requisitos.

## Evidências e mudanças

A auditoria percorreu ativações, comandos, permissões, persistência SQLite, proteção, eventos, XP, plugins, runtime, updater, supervisor e testes. A referência pública consultada foi `Salientekill/ESDEATH-RUST/main/atualizar.sh`. Staging, verificação pelo binário instalado, publicação por rename e registro de versão em teste são verificáveis nesse script. Não foi inferida a implementação privada do binário.

Arquivos alterados:

- `src/activations/manager.js`: valida estados booleanos e opções; recusa modos desconhecidos, verifica incompatibilidades e ownerOnly; desligamento de dependências agora é transitivo; API de diagnóstico sem mutação.
- `src/activations/registry.js`: registro de aliases validado integralmente antes de alterar índices; metadados explícitos de grupo, dependências e incompatibilidades.
- `src/activations/store.js`: preload respeita campos legados do grupo; histórico limitado, consultado por JID no SQLite existente.
- `src/commands/activations.js`: diagnóstico, diagnóstico completo exclusivo do dono, histórico e status de função, mantendo verificação de identidade existente.
- `src/updater/service.js`: fsync antes de rename, sintaxe e suíte de testes no staging antes da aplicação; journal com SHA-256 dos backups antes de modificar código.
- `src/updater/supervisor.js`: recuperação de aplicação interrompida antes de iniciar o runtime.
- `package.json`, `package-lock.json`: versão 1.3.2.

Arquivos criados:

- `src/updater/recovery.js`: recuperação idempotente do journal, pré-validação de todos os backups, recusa de caminhos protegidos/symlinks, restauração do código e dependências anteriores quando disponíveis. Não restaura .env, sessões ou banco.
- `test/update-recovery.test.js`: interrupção, integridade do backup e proteção de dados.
- `test/activation-diagnostics.test.js`: diagnóstico de dependências/admin e entradas inválidas.
- Este relatório.

Antes, uma morte do processo no meio da aplicação poderia deixar arquivos misturados, sem registro suficiente para restaurá-los. Agora o journal fica persistido antes da troca; na inicialização supervisionada seguinte, restaura-se o código anterior antes de carregar o runtime. Se a integridade do backup não for comprovada, a inicialização é recusada. A troca de vários arquivos continua não sendo uma operação única do filesystem; a garantia implementada é recuperação antes do boot seguinte.

## Uso

- `!ativacoes diagnostico`
- `!ativacoes diagnostico completo` — dono
- `!ativacoes historico` — admin/dono, somente grupo atual
- `!antilink status` e demais comandos de função registrados

Os setores continuam informativos. Seleção numérica e confirmação existentes foram mantidas. Nenhuma funcionalidade de jogos, RP, Alcateia, economia, WOK/Gold ou identidade foi removida. Não houve migration nova nem execução contra o banco real do usuário. As transações e o cache após commit existentes foram preservados.

## Validação

385 testes passaram em Node 22 e Node 24, incluindo sete novos testes. Sintaxe e startup são verificados separadamente; o startup utiliza ambiente de validação e não conecta ao WhatsApp. Não houve teste de atualização real no host Bronxys, de envio de mensagens reais ou de desligamento físico do servidor.

## Limitações restantes — não anunciar como implementadas

- Manifesto oficial SHA-256 assinado/Ed25519, publicação de chaves e pipeline de release não foram implementados nesta etapa. O download continua fixado ao commit do repositório confiável e validado por Git blob hash; o SHA-256 novo protege os backups locais, não autentica releases.
- Período de saúde de três minutos, três crashes, rollback automático pós-boot, bad-releases, histórico e rollback manual do updater ainda não existem.
- Retenção de backups, coleta de staging abandonado, classificação completa de personalizações, migrations reversíveis e verificação de espaço continuam pendentes.
- Command Registry, contratos de plugins, rate limiter e ciclo de reconexão ainda exigem as alterações arquiteturais solicitadas.
- Adaptadores internos legados de configuração ainda precisam convergir integralmente para a mesma política de validação do Manager. Diagnóstico não faz análise estática de todo o código nem comprova disponibilidade de dependências externas.
- Auditoria existente ainda não registra origem do comando em coluna própria.
- Primeira instalação que ainda não possua o módulo de recuperação não pode se beneficiar retroativamente dessa recuperação. O mecanismo protege atualizações subsequentes executadas pela versão nova.
- fsync de arquivos não equivale a garantia contra qualquer falha de hardware/filesystem. Backup adulterado provoca parada segura, não reparação automática.
