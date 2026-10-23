# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — Menus 3.4

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

🌹 Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺

`!menu` apresenta somente usuário, prefixo, versão, uptime, latência interna de renderização, status, quantidade de comandos e categorias. A latência interna não é um teste de rede com o WhatsApp.

Categorias oficiais: jogos, alcateia, midia, adm, dono, util, figurinhas, pesquisa, ia, diversao, grupo, info, ferramentas, rp, economia. Use `!menu categoria` ou o atalho `!categoria`. Os atalhos antigos `!rp` e `!alcateia` mantêm seus subcomandos de jogo. `!ajuda` e `!help` continuam funcionando. Categorias desconhecidas exibem apenas as opções válidas. Maiúsculas e minúsculas são aceitas.

O prefixo vem da configuração atual. Não é necessário trocar `!` no código para usar outro prefixo. As bordas de rosas, lobos, símbolos e assinatura do menu anterior foram reutilizadas na renderização compartilhada. A identidade oficial usa exatamente os valores oficiais da configuração padrão, mesmo quando uma instalação antiga contém outro nome personalizado.

## Inventário e classificação

Foram encontrados 90 comandos funcionais canônicos e 46 aliases, sem contar `menu` nem os 13 novos atalhos de navegação. `rp` e `alcateia` são os outros dois atalhos, preservando suas rotas existentes. O total visível acompanha os comandos e plugins efetivamente carregados; desabilitar plugins pode reduzi-lo. `npm run audit:commands` gera a relação dos contratos distribuídos com o projeto, com comando, origem, categoria, permissão, aliases, estado, uso e dependências. A auditoria não abre bancos nem conecta ao WhatsApp.

Os handlers e registro de comandos, carregador e comandos dos dois plugins, renderizadores antigos de menus, mídia, figurinhas, moderação, administração, economia, perfis, diversão, parser de mensagens, configurações, permissões, limites, eventos de grupo, serviços e armazenamento dos jogos foram examinados para definir o catálogo. Não há serviços de IA nem comandos independentes de transformação de mídia instalados para anunciar em IA e ferramentas: as categorias ficam disponíveis com aviso de ausência.

- **Jogos:** Akinator simplificado e atalhos para 100 Lobisomens e Cidade RP.
- **Alcateia:** registro, perfil, formação, treino, ataque, ranking, boosts, compras, clãs e evento do novo jogo; estratégia, ataque, cura, informações e ranking dos lobos originais em subseção própria. Não despeja o RP. Reset privilegiado fica em ADM; administração dos jogos fica em Dono.
- **Mídia:** MP3, MP4, TikTok e Instagram. `play_audio`/`play_video` são aliases reais de `ytmp3`/`ytmp4`; `playmp3`/`playmp4` permanecem.
- **Pesquisa:** `play` (resultado de busca YouTube) e `spotify` (link de busca; não promete download Spotify).
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

Áudio: MP3, `audio/mpeg`, até 10 minutos. Vídeo: MP4 com áudio, até 5 minutos e até 720p quando disponível. Limite de 32 MiB, obtenção de metadados/busca com timeout, cancelamento de streams/conversão, nomes de arquivos seguros, diretório temporário único por pedido e limpeza em sucesso ou falha. Vídeo seleciona os formatos MP4 combinados disponíveis; se não houver, orienta tentar outra mídia ou áudio. Links externos disfarçados de YouTube são rejeitados; falhas não expõem caminhos, tokens ou stack traces.

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
