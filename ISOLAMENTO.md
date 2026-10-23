# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — Dados por grupo (3.7.0)

🌹 Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

A migração segue a escolha do dono: **copiar o progresso anterior para cada grupo e manter as cópias independentes depois**.

## Comportamento

O mesmo jogador pode ter saldos, XP, níveis, premium, lobos, formações, HP, vitórias, derrotas, boosts, treinos, eventos, inventários, profissão, família e clã diferentes em cada grupo. Rankings, transferências, batalhas e ações profissionais usam somente o chat em que o comando foi enviado. Gold continua separado de WOK Coin; RP e nova Alcateia compartilham WOK Coin dentro do mesmo chat.

Banimentos e mutes aplicados pelos comandos antigos também passam a atuar no chat atual. Donos configurados, administradores do bot, sessão do WhatsApp, atualização e controles globais de manutenção continuam globais. Administradores de grupo continuam sendo verificados pelos metadados daquele grupo. Ativações, respostas automáticas e registros de atividade mantêm sua configuração por JID de grupo.

O privado tem contexto independente por conversa: ações no privado não movem saldo nem progresso de um grupo. Daily, escudos e cooldowns do cache são identificados pelo chat; regras de comandos e limites dos jogos também ficam separadas entre chats.

## Cópia inicial e persistência

Na primeira inicialização da versão, a migração 6 captura no SQLite uma cópia fixa das tabelas legadas de progresso. As tabelas originais são preservadas. No primeiro uso de cada chat, as tabelas isoladas são criadas **dentro do mesmo arquivo SQLite**, copiando essa referência inicial. Não há novos arquivos de banco por grupo. Assim, um grupo acessado amanhã recebe o progresso da migração, e não o saldo que outro grupo ganhou hoje. A cópia não é reaplicada em chats já inicializados.

Para RP/Alcateia, o armazenamento JSON existente mantém o jogo antigo como histórico, registra uma cópia inicial (`gameSeed`) e passa a salvar cada chat em `games[JID]`. A fila única de escrita e a gravação por arquivo temporário continuam protegendo alterações simultâneas. Uma falha ao salvar desfaz apenas a transação corrente. O backup do jogo agora inclui todas as cópias por chat e o modelo inicial.

O histórico anterior é copiado integralmente conforme a escolha de migração; dados novos não atravessam grupos. Cooldowns persistidos no jogo são copiados com os horários originais, sem liberar recompensas de registro novamente. Os caches temporários legados mantêm sua natureza temporária; após reiniciar, novas entradas usam chaves por chat.

## Implementação

`src/isolation/context.js` usa AsyncLocalStorage para manter o JID ao longo de operações assíncronas, sem variável global mutável. Mensagens e entradas/saídas de membros passam pelo contexto antes de acessar os dados.

`src/isolation/sqlite.js` encaminha consultas preparadas e execução SQL de progresso para partições identificadas por hash do chat. SQL direto existente, incluindo compras e premium, usa a mesma proteção. Criação e cópia são transacionais e idempotentes. As tabelas globais de configurações e autoridade não são convertidas em progresso local.

O adaptador de RP/Alcateia cria o serviço com a visão daquele chat; ele mantém os JIDs reais dos jogadores e as validações existentes. Não se alteram números ou menções para simular isolamento.

## Verificação

Testes cobrem cópia de Gold/XP/premium/lobos, alterações concorrentes em grupos diferentes, privado separado, rankings, mutes/banimentos, SQL direto, reaplicação da cópia, grupo criado depois, reinício do SQLite, RP/família/clã/cooldown separados, rollback de gravação, backup com todos os grupos, chaves de cache e contexto após exceções. Os testes existentes foram mantidos; a inspeção de dados no adaptador foi ajustada para consultar o chat correspondente.

Atualize pelo Git Pull e reinicie. Não apague `data/`, `storage/`, `.env` nem a sessão. Evite voltar para versões antigas que não reconhecem o formato separado: elas exibiriam o histórico global antigo, sem os avanços locais novos.

Validação final: **335 testes aprovados no Node 22.23.3 e 335 no Node 24.19.0**, com diagnóstico de inicialização aprovado em ambos. Um teste adicional passou pelo handler real de mensagens e comandos em dois grupos simulados, confirmando a separação dos saldos. Não houve pareamento de teste com WhatsApp real.
