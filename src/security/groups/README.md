# LOBO SECURITY — v1.8.0

## Auditoria anterior à implementação

O projeto já utilizava Node.js + Baileys 7.0.0-rc14, better-sqlite3 com WAL, ativações por grupo em `registry/manager/store`, auditoria de ativações, advertências persistentes e resolução de PN/LID. Existiam antirroubo básico de nome/descrição/configuração em `group-guard` e os atalhos `!adm perm`, sem cobertura completa de eventos administrativos. Havia verificações de administrador duplicadas, cache de metadata de 60 segundos e imunidade de dono em handlers individuais. Anti-Edit não possuía um handler real; foi implementado nesta edição.

A análise dos tipos e emissores da biblioteca instalada confirmou: participantes em `group-participants.update`, alterações de assunto/descrição/configuração em `groups.update`, edições em `messages.update` e foto em `GROUP_CHANGE_ICON`, recebido por `messages.upsert`. Não foram presumidos autor ou IDs que o evento não informa. Não foi utilizado código nem binário da ESDEATH.

Este trabalho é exclusivo de administração e segurança. Jogos, RP, economia e seus dados não foram alterados.

## Banco e compatibilidade

Migration **14**, aditiva: `group_security`, `trusted_admins`, `group_audit_log`, `security_incidents`, `group_snapshots`, `security_event_keys`, `security_internal`, `security_action_windows` e `group_picture_guard`, com índices por grupo/autor/data. Os flags continuam em `group_activations`; não existe outro conjunto independente de ON/OFF.

O antirroubo antigo ativo é migrado para nível alto, preservando nome/descrição/configurações de referência e a whitelist. Flags anteriores são mesclados, não apagados. A tabela antiga permanece como histórico; `group-guard` virou fachada da implementação nova. `!adm perm on/off/permitir/revogar` continua disponível para donos globais. O atalho on ativa antirroubo + lockname + lockdesc e mantém a restrição de edição do grupo, como antes.

## Confiança e autorização

0 membro; 1 administrador WhatsApp; 2 administrador confiável registrado ou administrador do bot autorizado; 3 criador/superadmin real; 4 dono protegido registrado no grupo; 5 dono global cadastrado.

JIDs são resolvidos por metadata recente e mapeamentos PN/LID do WhatsApp. Nome de perfil e texto de mensagem não concedem autoridade. A conta conectada não vira dona automaticamente.

- Admin normal pode consultar o painel e configurar as proteções antigas, enquanto o Anti-Roubo não exigir confiança adicional.
- Nível 2+ configura LOBO SECURITY.
- Nível 3+ gerencia whitelist e pode definir o primeiro dono protegido.
- Alterar/remover dono protegido existente exige nível 4+; restauração que troca o dono exige dono global.
- Modo punitivo 3 exige nível 4+.
- O dono global, o próprio bot e o criador real não podem ser punidos pelos comandos administrativos. A imunidade histórica do contato oficial também foi preservada, sem lhe conceder uma nova autoridade de configuração.
- Alvos de confiança superior ou igual ao executor não são punidos por comandos de nível inferior/igual. Com Anti-Demote ativo, um admin confiável também não pode rebaixar externamente outro protegido de confiança igual/superior sem disparar a política; o admin confiável não recebe punição automática.

`PermissionService` está em `src/security/groups/permissions.js`. O núcleo de comandos, handlers de moderação, advertências e remoções automáticas consultam a camada central. Antes de alterações reais de participantes, identidade, cargo atual e permissão do bot são verificados novamente. Metadata tem cache limitado de 3 segundos para consultas e atualização forçada em operações críticas. O cache é limitado a 1000 grupos e não mantém listas de admins indefinidamente.

## Comandos

- `!security`: painel do grupo e último incidente.
- `!seguranca baixa|media|alta|extrema`.
- `!ativacoes`: painel automático com os recursos reais.
- `!ativar RECURSO`, `!desativar RECURSO` e seleção numérica existente.
- `!antiroubo`, `!antipromote`, `!antidemote`, `!antimasskick`, `!antimasspromote`, `!lockname`, `!lockdesc`, `!lockpic`, `!antiedit`, `!somenteadmins`: `on`, `off`, `status`.
- `!boasvindas` e `!ativar boasvindas`: aliases da função `bemvindo` existente.
- `!antipv` mantém a função global anterior, exclusiva do dono. `!ativar antipv` explica essa distinção; não existe detecção das conversas privadas entre membros de um grupo.
- `!trust @pessoa`, `!untrust @pessoa`, `!trusted`.
- `!setdono @pessoa`, `!dono`, `!deldono`. `!dono` mostra o dono protegido no grupo; o menu anterior permanece em `!menu dono`, e `!dono` no privado continua abrindo esse menu.
- `!setnameguard [NOME]`, `!setdescguard [DESCRIÇÃO]`: sem texto, adota o valor atual como referência; com texto, altera e atualiza a referência, exigindo admin do bot no WhatsApp.
- `!snapshot`, `!snapshots`, `!restaurargrupo [ID]`.
- `!audit`, `!audit @pessoa`, `!audit 20`: até 50 registros, somente deste grupo. Auditoria exige administrador autorizado ou dono.
- `!antimasskick config QUANTIDADE SEGUNDOS` e equivalente para antimasspromote.
- `!antipromote modo 1|2|3` e equivalente nas demais proteções.

O submenu `!menu seguranca` reúne os comandos sem tornar o menu administrativo antigo gigantesco. Não houve inclusão nem alteração de catálogo de jogos.

## Políticas e independência dos flags

Baixa registra; média registra e alerta; alta também tenta reversões validadas; extrema habilita antirroubo, antipromote, antidemote, antimasskick, antimasspromote, lockname e lockdesc. Foto exige captura válida separada e Anti-Edit continua opcional.

Cada flag é independente. Anti-Roubo cuida das permissões internas, alterações de configuração e alerta de perda do cargo do bot. A restauração de cargos externos depende de Anti-Demote. Anti-Promote controla promoções; desligá-lo não é ignorado porque Anti-Roubo está ativo. Lockname/lockdesc/lockpic controlam seus respectivos campos. Anti-MassPromote pode agir por excesso mesmo quando Anti-Promote individual está desligado.

Modo 1 alerta; modo 2 tenta reversão; modo 3 permite também rebaixar o autor confirmado, apenas se ele for um admin comum, não protegido, e o bot ainda for admin. Não há expulsão automática do autor. Para remoções em massa, não há readição de usuários: modo 3 pode rebaixar o autor confirmado, sem fingir restaurar os membros removidos.

Os modos mais fortes não dispensam validação. Autor desconhecido gera `ACTOR_UNKNOWN`, registro e alerta, sem reversão punitiva. Eventos antigos que já não correspondem ao estado atual são marcados `STALE_EVENT`. Metadata que repete os mesmos valores não gera um novo ataque.

Se o bot perder admin, o sistema usa LOG + ALERT. Não tenta recuperar sozinho o cargo do bot. Alertas ao grupo têm intervalo padrão de 30 segundos por tipo de ação; a auditoria continua registrando incidentes distintos.

## Ações em massa, idempotência e anti-loop

Padrão: 5 remoções em 30s e 3 promoções em 20s. Limites podem ser alterados por grupo entre 1–100 ações e 1–300 segundos. Saída voluntária com autor igual ao alvo não conta como remoção administrativa. Eventos sem autor podem produzir alerta de massa anônima, mas nunca punição de uma pessoa presumida.

Atividade em massa de um autor confiável é registrada e alertada como autorizada, sem punição automática. Um incidente de massa não autorizado confirmado pode pausar ações relacionadas por 60 segundos. Remoções automáticas respeitam a pausa. Dono global mantém recuperação manual. Comandos do próprio bot também têm limitação de operações em massa quando a proteção está ligada; a limpeza de inativos não ultrapassa o lote configurado.

Eventos que possuem ID estável são deduplicados persistentemente. O contrato Baileys de participantes/grupos não fornece um ID único para cada ação: nesses casos é usado fingerprint de grupo/ação/autor/alvo/valor com janela de 15s, além de conferência de estado recente. É uma limitação explícita, não uma garantia impossível de deduplicação eterna. Edições usam ID da mensagem + timestamp da edição quando disponível.

Reversões e ações internas recebem marcadores temporários. Eventos do próprio bot são reconhecidos e não viram ataques. Verificação de resposta do WhatsApp evita anunciar reversão ou remoção bem-sucedida quando o servidor recusou.

## Foto e snapshots

Lockpic captura a foto atual apenas ao habilitar ou quando uma alteração autorizada precisa atualizar a referência. Usa download HTTPS público validado, conversão para JPEG de até 1 MB e hash SHA-256. A referência fica no SQLite. Sem captura válida, a ativação falha e permanece desligada. Foto corrompida não é enviada como restauração. O WhatsApp pode omitir o autor, negar acesso à foto ou não entregar um evento; nesses casos não há garantia de reversão.

Snapshots incluem nome, descrição, configurações, whitelist e dono protegido, com retenção de dez por grupo. Não incluem conversas, credenciais ou listas de todos os membros. Restaurar não readiciona participantes e não concede cargos no WhatsApp. Trocas externas não são transações SQL: se uma etapa de nome/descrição falhar, o bot tenta compensar as etapas anteriores e registra `FAILED_AND_COMPENSATED` ou `PARTIAL_RESTORE`, sem declarar sucesso falso. Dados internos usam transação e o cache é invalidado se a restauração falhar. Preparações assíncronas revalidam a autorização antes do commit; ativações simultâneas mesclam referências sem sobrescrever outro lock ou o dono protegido.

## Limites técnicos e testes

Nenhum bot impede o criador real de remover o bot ou garante recuperação de um grupo tomado. Este sistema reduz ações internas indevidas, registra eventos disponíveis e tenta reversões que o WhatsApp autoriza. Não solicita permissões inexistentes nem viola limitações da plataforma.

A validação usa metadata, eventos e respostas do WhatsApp simulados, além de SQLite real. Não foram feitos ataques ou alterações em grupos reais. O relatório da entrega informa a contagem final de testes e arquivos. As migrations serão aplicadas na hospedagem ao iniciar a versão nova; sessão, .env e bancos existentes não foram acessados no servidor nesta tarefa.
