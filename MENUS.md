# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — Menus 3.4

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

🌹 Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺

`!menu` apresenta somente usuário, as 15 categorias e a instrução de navegação, mantendo a moldura e a identidade oficial. `!ping` apresenta prefixo, versão, uptime, ping interno, status e quantidade de comandos sem aliases. Os valores são dinâmicos. O ping interno mede processamento local, não latência de rede com o WhatsApp.

Categorias oficiais: jogos, alcateia, midia, adm, dono, util, figurinhas, pesquisa, ia, diversao, grupo, info, ferramentas, rp, economia. Use `!menu categoria` ou o atalho `!categoria`. Os atalhos antigos `!rp` e `!alcateia` mantêm seus subcomandos de jogo. `!ajuda` e `!help` continuam funcionando. Categorias desconhecidas exibem apenas as opções válidas. Maiúsculas e minúsculas são aceitas.

O prefixo vem da configuração atual. Não é necessário trocar `!` no código para usar outro prefixo. As bordas de rosas, lobos, símbolos e assinatura do menu anterior foram reutilizadas na renderização compartilhada. A identidade oficial usa exatamente os valores oficiais da configuração padrão, mesmo quando uma instalação antiga contém outro nome personalizado.

## Inventário e classificação

Foram encontrados 90 comandos funcionais canônicos e 46 aliases, sem contar `menu` nem os 13 novos atalhos de navegação. `rp` e `alcateia` são os outros dois atalhos, preservando suas rotas existentes. O total visível acompanha os comandos e plugins efetivamente carregados; desabilitar plugins pode reduzi-lo. `npm run audit:commands` gera a relação dos contratos distribuídos com o projeto, com comando, origem, categoria, permissão, aliases, estado, uso e dependências. A auditoria não abre bancos nem conecta ao WhatsApp.

Os handlers e registro de comandos, carregador e comandos dos dois plugins, renderizadores antigos de menus, mídia, figurinhas, moderação, administração, economia, perfis, diversão, parser de mensagens, configurações, permissões, limites, eventos de grupo, serviços e armazenamento dos jogos foram examinados para definir o catálogo. Não há serviços de IA nem comandos independentes de transformação de mídia instalados para anunciar em IA e ferramentas: as categorias ficam disponíveis com aviso de ausência.

- **Jogos:** Akinator simplificado e atalhos para 100 Lobisomens e Cidade RP.
- **Alcateia:** registro, perfil, formação, treino, ataque, ranking, boosts, compras, clãs e evento do novo jogo; estratégia, ataque, cura, informações e ranking dos lobos originais em subseção própria. Não despeja o RP. Reset privilegiado fica em ADM; administração dos jogos fica em Dono.
- **Mídia:** MP3, MP4, TikTok e Instagram. `play_audio`/`play_video` são aliases reais de `ytmp3`/`ytmp4`; `playmp3`/`playmp4` permanecem.
- **Pesquisa:** `spotify` (link de busca; não promete download Spotify).
- **Figurinhas:** `sticker`, `stickeranim`, `toimg` e aliases.
- **ADM:** moderação, proteções, marcações, reset dos lobos, agendamento e respostas automáticas, com níveis originais.
- **Dono:** atualização, administradores do bot, broadcast e `admin` dos jogos com todos os subcomandos reais. Os donos fixos do jogo continuam os mesmos; mostrar o menu não concede acesso.
- **RP:** personagem, profissões, trabalho, ações, inventário, itens, família e perfis/níveis gerais antigos.
- **Economia:** Gold original, premium e loja original; carteira, transferências e loja RP em WOK Coin. A loja de boosts exclusiva permanece em Alcateia.
- **Grupo:** estatísticas e indicação dos eventos automáticos de boas-vindas/despedida.
- **Info:** ping, uptime e plugins, com versão, dono e contagem.
- **Diversão:** dado, moeda, 8ball, piada, fato, sorteio, azar, escolher e ship.
- **Util:** `olamundo`, quando o plugin de exemplo estiver habilitado. Plugins sem categoria conhecida também aparecem aqui para não ficarem ocultos.

Antes, `resetarlobos`, `addadmin`, `removeadmin`, `broadcast`, `agendarmensagem`, `autoreply`, `removeautoreply`, `plugins` e `olamundo` não apareciam nos menus principais. Os detalhes administrativos e de família também não estavam integralmente documentados no menu. Todos passam a constar no catálogo. Nenhum handler foi excluído. Foram retiradas promessas genéricas sem comando correspondente, como downloader universal e recursos extras de figurinhas sem implementação. Não foram inventados Google, IA, clima, calculadora, eleições, territórios ou missões.

## Mídia

Áudio: MP3, `audio/mpeg`, até 30 minutos. Vídeo: MP4 com áudio, até 10 minutos e até 720p quando disponível. Limite de 32 MiB, obtenção de metadados/busca com timeout, cancelamento de streams/conversão, nomes de arquivos seguros, diretório temporário único por pedido e limpeza em sucesso ou falha. Vídeo seleciona os formatos MP4 combinados disponíveis; se não houver, orienta tentar outra mídia ou áudio. Links externos disfarçados de YouTube são rejeitados; falhas não expõem caminhos, tokens ou stack traces.

Foram preservados os nomes antigos e corrigidos os aliases ausentes `play_audio` e `play_video`, tratamento de erro do stream de vídeo, ausência de timeout/limite de tamanho e temporários deixados em falhas. Busca, obtenção e entrega ainda dependem da disponibilidade do YouTube e dos serviços externos. Testes locais não equivalem a envio real pelo WhatsApp.

## Preservação e validação

Nenhuma migração ou conversão de dados foi introduzida. Sessão, bancos, saldos, premium, RP, lobisomens, clãs, família e demais sistemas permanecem. Regras de permissões, blacklist, registro, antiflood e limites dos jogos foram mantidas. O plugin deixou de sobrescrever `menu` e de acrescentar automaticamente duas páginas ao menu principal; seus atalhos delegam ao menu central após as verificações e cota existentes.

A suíte verifica as 15 categorias, menu principal, aliases novos e antigos, categoria inválida, prefixos, identidade Unicode exata, bordas, tamanho, separação de categorias, permissões de membro/admin/dono, grupo/privado e cooldown. Os testes anteriores de persistência, economia, RP e alcateia continuam na execução completa. Os testes de mídia cobrem busca/nome/URL, MIME, extensão, duração, tamanho, timeout, erros e limpeza, além da conversão real com FFmpeg. O diagnóstico de inicialização verifica as dependências reais e SQLite em memória, sem parear com WhatsApp.

O carregamento completo dos handlers detectou uma falha nativa do better-sqlite3 11 no Node 24. O driver foi atualizado para 12.4.1, que declara suporte a Node 22 e 24, mantendo o banco e as migrações existentes. A instalação e a suíte completa foram verificadas separadamente nessas duas versões do Node.

## Arquivos da entrega

Analisados: `src/handlers/commands.js`, `src/handlers/message.js`, `src/handlers/groupEvents.js`, `src/handlers/protection.js`, `src/core/commandRegistry.js`, `src/core/pluginLoader.js`, `src/commands/*.js`, `src/middlewares/*.js`, `src/config/*.js`, `src/utils/database.js`, `src/utils/helpers.js`, `src/services/index.js`, os dois plugins, os módulos de jogo/RP/identidade/armazenamento e renderização em `addons/alcateia/src`, a suíte de testes e manifestos de dependências.

Modificados: `src/commands/menu.js`, `src/commands/media.js`, `src/core/commandRegistry.js`, `src/handlers/commands.js`, `src/updater/source.js`, `plugins/alcateia-rp.js`, `package.json`, `package-lock.json`, `README.md`, `test/alcateia-plugin.test.js`, `test/legacy-menu-visual.test.js`.

Criados: `src/menus/catalog.js`, `src/menus/render.js`, `src/commands/youtube-media.js`, `scripts/audit-commands.js`, `test/youtube-media.test.js` e este relatório.

Resultado: 292 testes aprovados no Node 22.23.3 e 292 no Node 24.19.0; diagnóstico de inicialização aprovado em ambos. Nenhuma conexão de teste ao WhatsApp real foi realizada. Não se afirma disponibilidade permanente de YouTube, TikTok ou Instagram.

## Ajuste de reprodução — 3.4.1

`!play nome ou link` agora baixa e envia MP3 diretamente. `!play video nome ou link` envia MP4; `!play audio`, `!play mp3` e `!play mp4` também selecionam o formato. `ytmp3`, `ytmp4`, `play_audio` e `play_video` permanecem. O comando `play` foi movido de Pesquisa para Mídia. Não é mais uma busca que devolve apenas um link.

O limite de áudio aumentou para 30 minutos e o de vídeo para 10 minutos, mantendo 32 MiB por mídia. Foi adicionado um cliente alternativo YouTube.js quando o ytdl-core falha nos metadados ou no stream. A interpretação de assinaturas usa Jinter em worker separado com prazo e limite de memória. Não utiliza programas Python.

297 testes passaram no Node 22.23.3 e 297 no Node 24.19.0, além dos diagnósticos de inicialização. Um teste de acesso real ao YouTube retornou HTTP 403 neste ambiente; isso impede afirmar que um download externo completo foi validado. Restrições de IP, conteúdo privado ou bloqueios da plataforma podem impedir o download no servidor.


## Padronização 3.8.0

Os 15 submenus usam a moldura principal sem recuo, títulos/comandos em negrito e descrições em itálico. O nome do usuário e o prefixo são dinâmicos. Avisos compartilhados, erros de comandos, permissões e atualização usam a moldura compacta. A conexão no terminal e no WhatsApp usa o modelo floral oficial. Contato, lema e assinatura permanecem centralizados no renderizador.

A atualização por comando cria `updates/backup-*/protected-data/` antes de substituir código: `.env`, `sessions`, `auth`, `data` e `storage`. SQLite usa a API de snapshot, incluindo transações confirmadas no WAL. Links são recusados e falhas interrompem a atualização. O backup contém credenciais privadas; não publique nem compartilhe essa pasta. O código não apaga nem restaura dados automaticamente. Backups representam o estado no momento da captura; mensagens recebidas posteriormente continuam nos dados originais.

Proteção de dono cobre ban, mute, kick, rebaixamento, remoção de inativos e banimento do jogo. LIDs precisam de resolução confiável antes de punições. Novos comandos punitivos devem reutilizar o mesmo verificador.

Esta revisão não anuncia funções ausentes como se existissem: IA, OCR, remoção de fundo, cassino, forca e velha não foram acrescentados. As categorias permanecem disponíveis e indicam ausência de comandos quando aplicável. Essas expansões precisam de implementação própria e, nos recursos externos, de provedor configurado. Não foi feita validação em WhatsApp real nesta revisão.


## AntiLink e advertências 3.9.0

- `!antilink on/off`: todos os links (alias `!antilinkgeral`).
- `!antilinkgrupo on/off`: somente convites de grupos do WhatsApp (aliases `!anticonvite`, `!antilinkwhatsapp`).
- `!antilink delete` / `!antilinkgrupo delete`: ativam somente a exclusão da mensagem, sem avisos no chat, advertências ou expulsão.
- `!antilink warn` / `!antilinkgrupo warn`: apagam e somam uma advertência. A quinta remove o participante.
- `kick` continua disponível por compatibilidade e só é usado quando configurado explicitamente.
- `!advertir @participante motivo` (`!adv`, `!warn`): advertência administrativa.
- `!advertencias @participante` (`!avisos`): contador do grupo.
- `!resetadvertencias @participante` (`!resetadv`): zera somente nesse grupo, mantendo histórico administrativo.

Configurações dos dois AntiLinks são independentes; o modo inicial é delete. As advertências são compartilhadas entre ações manuais e links do mesmo participante no mesmo grupo, persistem no SQLite e não expiram automaticamente. Eventos repetidos não contam duas vezes. Links que acionam mais de uma regra somam somente uma advertência. Donos e administradores ficam isentos; o bot precisa ser administrador. Sem número resolvido, o bot apaga o link sem advertir. Nenhum histórico anterior de cache é inventado durante a migração.

Referência consultada: árvore pública de Salientekill/ESDEATH-RUST. A implementação das ativações/moderação não está exposta como fonte nessa distribuição; nenhuma paridade integral é prometida e nenhum executável da referência é executado. A implementação acima pertence à arquitetura JavaScript do Lobo Bot.


## Edição v1.0.0 — expansão de jogos

A numeração pública foi corrigida para v1.0.0 a pedido do dono. Isso não reverte código nem o histórico de migrações: o banco avança para a migração 9 e os dados anteriores permanecem. O ZIP mantém o nome Lobo-bot-v1.

Novos comandos disponíveis em `!menu jogos`:

- `!quiz`: cinco rodadas sorteadas sem repetição entre 20 perguntas, quatro alternativas e explicação das respostas. Use `!quiz 1`, `2`, `3` ou `4`.
- `!forca`: 16 palavras com pistas, letras normalizadas e limite de seis erros. Use `!forca a`.
- `!adivinhar`: número secreto de 1 a 100, pistas com intervalo atualizado e sete tentativas. Use `!adivinhar 50`.
- `!aventura`: Trilhas da Lua, três escolhas por cena, três rotas iniciais e oito finais. Use `!aventura 1`, `2` ou `3`.
- `!placarjogos`: dez melhores do chat, partidas, vitórias e conquistas Iniciante/Aprendiz/Explorador/Lenda Lunar.

Nos jogos, envie somente o comando ou `status` para rever a partida; `parar`, `sair` e `cancelar` encerram. Partidas ficam salvas por usuário, chat e jogo e expiram após 24 horas sem interação. Há espera de 60 segundos após terminar/cancelar. Os pontos são exclusivos do placar de minijogos e não são moeda; Gold e WOK Coin continuam com suas regras anteriores. Conclusões e pontuações são gravadas na mesma transação; reenvios da mesma mensagem são deduplicados.

O Akinator antigo deixou de sortear uma resposta sem relação com o jogador. Agora filtra 18 personagens catalogados com perguntas de atributos e pede confirmação da hipótese; respostas desconhecidas são aceitas como `talvez`. Sua sessão passa a persistir como as dos novos jogos. O comando e o cancelamento `parar/stop` foram preservados. Partidas antigas desse simulador existiam apenas em memória e não eram recuperáveis após reinício.

O evento lunar ganhou cinco cenas de exploração associadas às recompensas existentes, preservando os valores, limites e cooldowns. Nenhum comando anterior foi removido. As ativações do setor Jogos controlam também os novos comandos.


## Edição v1.1.0 — ativações por número e menus leves

Abra `!ativacoes` no grupo. Todos os recursos e setores são numerados automaticamente, em sequência. Envie somente o número desejado: o bot mostra o estado atual e pede confirmação. Responda `1` para confirmar a mudança ou `2` para cancelar. A seleção e a confirmação expiram em dois minutos cada. A interação pertence ao remetente e ao grupo que abriram o painel, revalida permissões antes de gravar e ignora reenvios da mesma mensagem. Uma confirmação pendente é descartada ao reiniciar; configurações já confirmadas persistem normalmente. Comandos diretos anteriores continuam funcionando.

Nome completo do bot, assinatura e lema deixam de aparecer nos menus, lojas, respostas de jogos, avisos e conexão. Permanecem no `!ping`, boas-vindas e despedidas. A identidade configurada não foi alterada. A ausência desses textos nos menus é intencional, conforme a preferência mais recente do dono.


### Prazo de inatividade — v1.1.1

Ao escolher Limpeza manual de inativos no painel e confirmar a ativação, o bot solicita um número inteiro de 1 a 90 dias. Envie apenas `15`, por exemplo, sem D ou outro sufixo. A função e o prazo só são salvos depois de uma resposta válida; prazo inválido não ativa a função. A configuração é independente por grupo e persiste após reiniciar. `!antiinatividade on` e `!ativar antiinatividade` também solicitam o prazo; `!antiinatividade 15` continua disponível. O painel mostra o prazo configurado. A ativação não executa remoções: use o comando de limpeza para aplicar o prazo salvo.


## v1.2.0 — setores informativos e atualização com reinício automático

`!setores` apresenta as 15 categorias, finalidade e atalhos. Setores não aparecem nem são numerados em `!ativacoes`. Comandos antigos de desativar/restringir setores são recusados; flags antigas ficam preservadas no banco como histórico, mas não bloqueiam mais categorias. Permissões nativas de dono/admin, banimentos, registros e cooldowns continuam obrigatórios. A pausa global do bot pelo dono permanece separada.

O caminho `node src/index.js` agora é um inicializador estável que supervisiona `src/runtime.js`. Depois de uma atualização concluída por `!atualizar bot`, ele encerra o processo WhatsApp antigo e inicia outro usando a mesma sessão. É necessário instalar e iniciar esta edição uma vez; uma versão antiga em execução não pode ganhar esse comportamento retroativamente. Nenhum pareamento novo é necessário se a sessão continua válida. No modo antigo sem inicializador, o comando avisa sobre esse reinício inicial pelo painel.

O atualizador reaplica o snapshot mesmo quando o commit já foi registrado, reparando arquivos locais alterados. Quando o grafo do lockfile permanece igual, verifica as dependências existentes no staging e as reutiliza. Se a verificação falhar, tenta uma instalação limpa antes de aplicar. Se houver mudança de dependências, usa npm ci. Falhas de rede, bloqueios do host, falta de disco ou testes de inicialização continuam interrompendo a operação com diagnóstico; nenhum comando consegue forçar a hospedagem a liberar recursos externos. Não se usa git reset, não se apagam sessões e os dados são copiados antes da publicação.


## v1.3.0 — donos, capas, doações e proteção do grupo

- `!donos lista`: painel exclusivo dos donos. O principal usa `!donos adicionar 55...` e `!donos remover 55...`. Cadastro persiste no SQLite; donos do ambiente exigem alteração do ambiente para remoção. A conta conectada não recebe poderes automaticamente. Donos adicionais recebem funções de dono, mas não podem gerir outros donos. Administração do jogo na integração também usa esse cadastro, sem conceder acesso apenas por uma lista antiga interna.
- `!fotomenu`: envie uma foto/GIF/vídeo com essa legenda ou responda à mídia. `!fotomenu ver` mostra a capa e `!fotomenu remover` retira. Só donos. Imagens são normalizadas para JPEG; GIF/vídeo vira MP4 sem áudio com reprodução animada, até 12 segundos, sujeito à compatibilidade do WhatsApp. Entrada limitada a 8 MB e uma conversão por vez. A capa é global, não os dados dos jogos. Se a mídia falhar, o menu continua em texto.
- `!doarwok @jogador quantidade`: emissão administrativa de moeda virtual por dono cadastrado, de 1 a 1000000 por operação, com auditoria no mesmo salvamento da carteira e deduplicação por mensagem. Destinatário precisa estar registrado nesse chat e não estar banido. A doação não debita o dono e não envolve dinheiro real. Não afeta Gold nem carteiras de outros grupos.
- `!adm` continua abrindo o menu administrativo. `!adm perm` mostra instruções/status; `!adm perm on/off` ativa/desativa o controle. Só donos gerenciam `!adm perm permitir @pessoa` e `!adm perm revogar @pessoa`. Os autorizados podem usar `!adm nome texto` e `!adm descricao texto`; bot precisa ser admin. Quando a proteção está ativa, comandos administrativos antigos de grupo também consultam essa autorização.

O antirroubo guarda nome, descrição, restrição de edição e modo de anúncios por grupo. Eventos não autorizados tentam restaurar esses campos; eventos confiáveis do bot/donos/autorizados atualizam a referência. Operações são serializadas por grupo e auditadas. Ao ativar, a edição de informações no WhatsApp é restrita a administradores. Não existe proteção absoluta: criador e WhatsApp podem retirar o bot, administradores podem usar o aplicativo, eventos podem faltar e o bot não pode restaurar configurações se perder privilégios. Foto, remoção de membros e mudanças de cargos não são revertidas automaticamente nesta edição. Alterações sem autor informado são tratadas como não autorizadas. Nenhum membro é expulso automaticamente por esse mecanismo.

A referência Esdeath disponibiliza distribuição compilada, sem fonte verificável de todas essas funções; não foi executada nem copiada. Esta edição implementa os recursos acima na arquitetura JavaScript existente, sem alegar paridade integral com o Esdeath.


## v1.3.1 — comandos curtos opcionais

`!atalhos` lista somente atalhos com destinos reais carregados e sem conflito com comandos existentes. Comandos completos e aliases anteriores continuam funcionando. `!família criar Nome`, `!familia criar Nome` e `!fam cr Nome` usam a mesma função. `!família Alcateia Criar Nome` também aceita o namespace extra, sem exigi-lo. Outros exemplos: `!inv`, `!cart`, `!trab`, `!prof`, `!profs`, `!tr`, `!atq`, `!ev`, `!cla cr Nome`, `!up b`, `!ds add número` e `!capa`. A forma curta é resolvida antes de aplicar permissões e cooldowns; não cria rotas privilegiadas paralelas nem novas carteiras. Argumentos livres, nomes próprios e valores são preservados. Em conflitos, o comando/alias já existente sempre ganha.


## Banimento do grupo — v1.8.2

`!ban @usuario` ou `!ban` respondendo a uma mensagem agora solicita a remoção real do grupo. Antes, esse comando apenas marcava o usuário como bloqueado para comandos. O comportamento anterior de bloqueio é mantido, mas só é salvo após o WhatsApp aceitar a remoção e uma consulta recente confirmar que o participante saiu. O bot precisa ser administrador e a hierarquia LOBO SECURITY continua obrigatória. Dono, próprio bot e participantes protegidos não podem ser removidos por nível inferior.

`!kick`/`!remover` usa a mesma confirmação de saída, sem bloquear comandos. `!unban` libera os comandos somente neste grupo e não readiciona o participante ao WhatsApp. Todos os nomes antigos permanecem disponíveis. Não existe bloqueio automático de reentrada por convite nesta correção.

O alvo usa o JID real da metadata, incluindo grupos com LID. O retorno do servidor precisa identificar cada participante e conter status de sucesso; respostas vazias, incompletas, recusadas ou destinadas a outra pessoa não geram sucesso. A metadata é consultada novamente, com tentativas curtas para propagação. Quando a saída não puder ser confirmada, o bot informa isso sem salvar banimento interno. Não é necessário reenviar o comando repetidamente: confira primeiro a lista do grupo.

Os aliases PN/LID confirmados são bloqueados/liberados juntos, em transação SQLite isolada pelo chat. Perfis inexistentes são criados sem modificar nomes, saldos ou progresso dos registros existentes. Se a remoção ocorrer e o banco falhar, a resposta informa o resultado parcial, sem alegar que o bloqueio foi salvo. Falha ao enviar a mensagem de confirmação não desfaz o banimento já persistido. Não há migration nem exclusão de dados nesta edição.


## Entrada automática e emissão de WoK coin

Comandos pessoais válidos, como !treino, !perfilalcateia, !rp perfil ou !profissao ID, criam os perfis necessários no primeiro uso. Não é necessário enviar !start ou !rp iniciar; ambos continuam disponíveis por compatibilidade. Escolher profissão, aceitar convites e outras decisões do jogador continuam sendo ações explícitas. Catálogos, menus e rankings não inscrevem pessoas automaticamente. Interações não criam o RP de terceiros nem aceitam consentimento por eles.

São usados os mesmos construtores e a mesma transação de antes. Uma ação inválida não deixa perfil parcial. Perfis antigos, inventários, profissão, família, lobos, cooldowns e saldo existente são preservados. O registro usa o saldo universal existente, inclusive zero, sem repetir bônus de entrada. Banimentos continuam valendo. As regras anteriores de identidade/país do jogo permanecem.

`!addwok 500 @participante` emite 500 WoK coin para o destinatário, sem descontar do dono. Somente donos reais cadastrados em BOT_OWNER/BOT_OWNERS ou !donos podem usar. !doarwok e !doacaowok permanecem disponíveis e passam pelo mesmo serviço de emissão. Quantidade inteira: de 1 a 1.000.000 por operação, respeitando o limite seguro do saldo. A emissão afeta apenas o chat onde foi executada.

O destinatário precisa ser resolvido pelo WhatsApp e, em grupo, estar presente. Não precisa ter enviado !start; o perfil necessário é preparado na transação, preservando carteira anterior. Um destinatário totalmente novo usa a carteira inicial normal do bot integrado (500 atualmente), e então recebe a quantidade solicitada; isso não é um segundo bônus por registro. O addon independente continua com seus padrões anteriores.

A emissão verifica novamente os donos ao executar a transação, registra emissor/destinatário/quantidade/antes/depois/data/origem e deduplica entregas da mesma mensagem. Repetir mensagem não duplica moedas; reutilizar ID com alvo/quantidade diferente é recusado. SQL, perfil, carteira e auditoria são confirmados juntos ou revertidos. Uma falha de envio da resposta não refaz a emissão já salva. Sessões, mídias dos menus e banco existente são preservados; não há migration nesta edição.


## Molduras, confirmações e versão oficial

Menus, HUDs e avisos compartilham o tema simétrico 🌹 & 🐺. Cabeçalhos e divisores são medidos por grafemas e colunas de exibição, limitados a 26, com títulos centralizados e comandos indicados por ▸. Valores, argumentos, IDs e barras usam monoespaçado. Nomes, contatos, lema e dados dinâmicos continuam presentes nos locais correspondentes. Capas, arquivos GIF e configurações personalizadas não são substituídos.

No !ativacoes, cada função exibe somente `〔 🟢 〕` ou `〔 🔴 〕` no indicador, sem números ou palavras dentro dele. Pendências de permissão/configuração ficam fora do indicador. A barra representa a proporção de funções disponíveis, sem prometer segurança absoluta. Os setores continuam informativos em !setores e não podem ser desligados.

Use !ativacoes antilink (ou outra função do registro) para abrir a confirmação. Responda `1` para SIM/confirmar ou `2` para NÃO/cancelar. Nada é salvo antes da confirmação; permissões e estado são revalidados. A escolha numérica antiga continua compatível. Inatividade continua pedindo de 1 a 90 dias, sem sufixo. Valores de dias, IDs e respostas dos jogos mantêm suas regras próprias: não são confundidos com confirmações. Comandos diretos continuam aceitando on/off, 1/0 e também 2 como desativar.

A saudação e o relógio usam o horário de São Paulo. Nome, cargo, nível, saldo e XP do menu vêm do contexto existente, sem consultar novamente o banco. Ping só aparece quando há medição disponível; !ping continua mostrando suas métricas reais. Não há valores de latência ou saldos inventados.

As reações são opcionais para a execução: alternam 🌹/🐺 e contexto, depois marcam o fim do processamento com ✅. Falha ou demora na reação não impede o comando. Frases de batalha variadas usam aleatoriedade separada dos jogos e não mudam recompensas, cálculos ou estado.

A versão oficial permanece `1.0.0` no pacote, no !ping e no manifesto. Cada atualização é identificada pelo commit do GitHub e pelos hashes dos arquivos; não depende de aumentar a versão. A geração e a verificação da release recusam outro número. Não há migration de banco nesta atualização visual.
