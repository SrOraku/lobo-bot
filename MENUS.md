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
