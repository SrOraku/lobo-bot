# API Bronxys — integração v1.5.0

Integração modular própria baseada no catálogo CASES.js fornecido pelo usuário. O arquivo de exemplos não é executado nem copiado como um switch inteiro. Sessões, dados, moedas, grupos, jogos e identidade do bot não são alterados.

## Configuração privada

O código público não inclui chave de API. O bot lê `BRONXYS_API_KEY` do ambiente ou, se vazia, o arquivo privado `data/bronxys-api-key`. Esse arquivo é ignorado pelo Git e preservado pelo atualizador. A variável de ambiente tem prioridade.

No privado do bot, um dono cadastrado pode usar:

- `!apibronxys status` — informa se há configuração, sem mostrar a chave nem consumir a API.
- `!apibronxys chave SUA_CHAVE` — salva a chave no armazenamento privado, com permissão 600.

O comando de cadastro não aceita execução em grupo. Não mostra a chave na resposta. O pacote ZIP privado entregue nesta atualização já contém a chave fornecida no arquivo privado; ela não foi incluída no GitHub nem no .env.example.

## Downloads

Com a chave configurada, `!play`, `!play_audio`, `!ytmp3`, `!play_video`, `!playmp4` e `!ytmp4` usam os endpoints Bronxys e enviam arquivos. `!play video pesquisa` continua selecionando vídeo. `!playdoc` envia MP3 como documento.

`!tiktok` e `!ig`/`!instagram` também passam a usar a API quando configurada. `!spotify link` baixa áudio; a pesquisa antiga por nome permanece disponível. Sem chave, os caminhos antigos desses comandos continuam existindo.

Outros comandos do catálogo: `threads`/`thr`, `soundcloud`, `ifunny`, `kwai`, `tiktok_video`, `tiktok_audio`, `face_video`, `face_audio`, `twitter_video`, `twitter_audio`, `insta_audio`, `mediafire` e `aptoide`.

## Pesquisas, utilidades e IA

`tabelacamp` e seus aliases, `gruposwhatsapp`, `grupos`, `aptoide_pesquisa`, `signo`, `moedas`/`cotacao`, `letra` e aliases, `pergunta`/`openai`/`gpt`/`chatgpt`, `esportenoticias` e aliases, `playstore`, `celular`, `amazon`, `pesquisa_yt`/`ytsearch`, `print`/`printdesite`, `gimage`, `pinterest`, `cep`, `metadinha` e `gerarnick`.

`!moeda` mantém a brincadeira antiga; não foi substituído pela cotação. `!cep` consulta os oito dígitos fornecidos, corrigindo o CEP fixo do exemplo.

## Efeitos e uploads

- `!logos efeito texto`: agrupa os efeitos de texto dos endpoints logos, logos_EPH e logos_PHT. Os nomes originais também funcionam como aliases, por exemplo `!neongreen Nome` e `!lobometal Nome`.
- `!montagem efeito`: responda a uma imagem. Os nomes de efeitos do catálogo também funcionam diretamente.
- `attp`, `attp2`, `ttp_white`, `ttp_brat`, `attp_white`, `attp_brat`, `attp_white_video`, `attp_brat_video`.
- `!gerarlink2`/`!imgpralink2`: envia a imagem respondida à API e retorna o link.
- `!transcrever`: envia o áudio/vídeo respondido à API para transcrição.

Uploads, transcrição e montagem enviam a mídia selecionada ao provedor externo. Não há upload automático de mensagens do grupo.

## Limites e segurança

- Origem da API fixa em HTTPS; parâmetros codificados com URLSearchParams.
- URLs públicas verificadas por DNS, com bloqueio de redes privadas/loopback, validação de redirects e lookup fixado aos endereços verificados.
- A chave não é repassada ao Baileys como URL de mídia: o bot baixa o arquivo primeiro.
- Arquivos limitados a 32 MB; uploads limitados a 8 MB; JSON limitado a 2 MB.
- Timeout geral de 180s, requisições até 90s e conversão FFmpeg até 90s.
- Fila por chat com até cinco pendências; limites por comando e custo.
- Áudio é convertido realmente para MP3, inclusive quando o endpoint retorna vídeo; não é só renomeação do arquivo.
- Figurinhas estáticas são convertidas para WebP quando necessário.
- Temporários são removidos em finally; erros de transporte não são logados com URLs ou credenciais.
- Chave não aparece em mensagens de status, confirmações ou resultados de texto. APIs externas continuam sendo serviços confiados pelo usuário.

## Evidência de testes

419 testes aprovados em Node 22 e Node 24; lint, sintaxe e startup aprovados. Novos testes cobrem encoding de chave/query, ausência de chave, 401/429, erros sem vazamento, IPs privados/públicos, redirects, MP3 enviado como bytes, limpeza após falha, CEP informado, wrappers success/data, conflitos de aliases, proteção do comando de configuração e catálogo sem duplicatas.

Testes reais com a chave fornecida: consulta de CEP e endpoint play retornando audio/mpeg (642.710 bytes). O áudio recebido também foi convertido com FFmpeg e entregue a um socket simulado como MP3 (306.495 bytes). Não houve envio para um WhatsApp real neste ambiente.

Os demais endpoints foram integrados a partir dos contratos do CASES.js e testados com respostas controladas quando aplicável; não foram todos consumidos em produção. Disponibilidade, saldo, limites e mudanças de formato dependem da Bronxys. O bot trata respostas inesperadas sem fingir sucesso. Algumas APIs de download podem demorar, estar indisponíveis ou recusar conteúdo privado.

Nenhuma migration de banco ou atualização de dependências foi necessária para esta integração. Atualização pelo GitHub não altera chaves de instalações existentes; configure uma vez pelo comando privado ou pelo ambiente.


## Download automático — v1.5.1

Abra `!ativacoes`, selecione **22 — Download automático de redes sociais** e responda **1** para confirmar ou **2** para cancelar. O número vem do Registry; plugins/alterações futuras podem mudar a listagem, então confira o painel. Também funciona `!autodownload on/off`, `!autodl on/off` ou `!ativar autodownload`. Administradores e donos podem configurar; membros apenas enviam os links.

A opção começa desligada, fica salva no SQLite por grupo e não entra em ativar tudo, porque consome a cota da API. Depende da chave Bronxys; o painel/diagnóstico sinaliza configuração incompleta se a chave estiver ausente.

Redes reconhecidas: Instagram, Facebook, TikTok, Kwai, Threads, X/Twitter, YouTube, Spotify, SoundCloud e iFunny, usando os endpoints já integrados. Isso não significa suporte a toda rede existente: Pinterest, por exemplo, possui pesquisa de imagens nesta API e não foi anunciado como baixador de links.

Ao receber um link público suportado em texto ou legenda, envia mídia pelo mesmo baixador, com fila, timeout, conversão e limpeza já existentes. YouTube é baixado em vídeo por padrão; Spotify e SoundCloud em áudio. Para formatos diferentes, continuam disponíveis os comandos manuais.

Proteções executam antes do automático: link apagado/bloqueado pelo AntiLink não é baixado. Bot pausado, remetente silenciado/banido, mensagens do próprio bot e comandos com prefixo não disparam downloads automáticos. Não há processamento de histórico (o runtime recebe apenas eventos notify).

Limites automáticos: primeiro link suportado por mensagem, intervalo de 30 segundos por usuário e 10 segundos por grupo, deduplicação do ID da mensagem durante 15 minutos e memória limitada. Mensagens descartadas por esses limites não entram em uma fila para execução posterior. A função é revalidada ao iniciar um download que aguardava na fila. Uma operação já em andamento pode terminar após desligar a opção.

Sem chave configurada não consome a API nem baixa; use `!apibronxys status` para conferir a configuração local. As falhas do provedor são tratadas pelo baixador. URLs privadas, perfis sem postagem e domínios que apenas imitam uma rede conhecida não são tratados como posts suportados.

Testes adicionais: reconhecimento das dez redes, domínios falsos, comandos/privado/silenciados/pausa/chave ausente, deduplicação, limites, isolamento entre grupos, um link por mensagem, confirmação numérica, persistência e ordenação de AntiLink antes do download.


## Diagnóstico de play — v1.5.3

Se aparecer a mensagem antiga “Não foi possível obter a mídia. O serviço pode estar indisponível”, verifique a versão instalada em `!ping` e, como dono, execute `!apibronxys status` no privado. A versão atual informa a origem da configuração (ambiente/arquivo privado), versão instalada e se o play usará a API.

Uma instalação pelo GitHub não recebe a chave privada do ZIP. Cadastre uma vez com `!apibronxys chave SUA_CHAVE` no privado, ou configure BRONXYS_API_KEY. Não é necessário reiniciar após salvar pelo comando. Não é necessário desligar/reconectar a sessão WhatsApp.

`!apibronxys testar` faz uma consulta real de CEP para confirmar autenticação e resposta do provedor. É exclusivo do dono e consome uma requisição. Esse teste não garante que todo conteúdo de todas as redes esteja disponível.

A falha do baixador antigo sem chave agora orienta a configuração em vez de mostrar somente erro genérico. Os testes confirmam que, com chave reconhecida, áudio e vídeo usam a API antes de acessar o cliente antigo. Uma nova consulta real de play por nome retornou MP3 válido durante esta correção; não houve acesso ao servidor Bronxys do usuário para confirmar a configuração local dele.

### Correção 1.5.4 — backup e scripts do npm

O backup não interrompe mais a atualização apenas por encontrar um link simbólico.
Links internos para `sessions`, `auth`, `data`, `storage` ou `.env` são copiados como conteúdo comum. Links externos, quebrados ou cíclicos não são seguidos: ficam registrados no arquivo privado `backup-links.json`, com `complete: false`. Os destinos originais não são alterados. Esse relatório indica um backup parcial; faça backup separado de volumes externos. Falhas reais de leitura/escrita continuam interrompendo a atualização.

O `package.json` autoriza scripts de instalação somente nas versões explicitamente revisadas de SQLite, Sharp, FFmpeg Linux x64, Baileys e protobufjs. Não habilite scripts de todos os pacotes indiscriminadamente. O suporte a `allowScripts` depende da versão do npm da hospedagem.

Se a instalação antiga falha com `BACKUP_SYMLINK`, ela ainda usa o atualizador antigo. Para receber esta correção pela primeira vez, extraia o ZIP novo na raiz do bot, substituindo somente os arquivos do código. Preserve `.env`, `sessions/`, `auth/`, `data/` e `storage/`. Depois use `bash atualizar.sh` com a instalação de módulos habilitada. O ZIP configurado contém uma chave privada de API: não publique nem compartilhe esse pacote.

### Informações das músicas (1.5.5)

`play`, `play_audio`, `play_video`, `ytmp3`, `ytmp4` e `playdoc` enviam o arquivo com um painel separado de título, duração, publicação, canal e descrição fornecida pela fonte. Com Bronxys, a busca de metadados seleciona o vídeo e o mesmo URL é enviado ao baixador. A descrição não é resumida pelo bot: mensagens longas são divididas preservando o texto. Dados ausentes são identificados; uma falha de consulta não impede baixar a mídia. A fonte pode fornecer uma descrição incompleta; o bot não reconstrói trechos ausentes. Não há progresso fictício de 100%.


## Inicialização interrompida por STALE_LOCK — corrigida na v1.8.1

Uma queda durante download, instalação ou validação podia deixar `updates/update.lock` mesmo sem alterações no código ativo. O inicializador antigo bloqueava indefinidamente o próximo início. A nova versão confirma que o processo responsável terminou, arquiva a trava obsoleta e continua automaticamente. PID ativo ou identidade duvidosa continua bloqueando com BUSY; JSON vazio/corrompido gera LOCK_INVALID. Não apague toda a pasta updates.

As travas novas são diretórios não vazios publicados atomicamente com `owner.json`; o arquivo JSON legado continua sendo reconhecido. Identidade do processo no Linux detecta PID reaproveitado. Registros `retired-lock-*` preservam a identificação da trava recuperada e impedem que dois recuperadores removam uma trava recém-criada. Nenhuma credencial é gravada nesses registros.

Se houver `apply-journal.json`, só há restauração sob posse exclusiva da trava. Todos os hashes do backup são conferidos antes de alterar os arquivos; uma versão em teste da aplicação interrompida é cancelada após restaurar. Banco, sessão, .env e configurações privadas não são apagados ou substituídos pela recuperação do código.

**Para instalar a correção:** pare o servidor, envie e extraia o ZIP atualizado na raiz do projeto, substituindo o código, e mantenha `.env`, `sessions/`, `data/`, `storage/` e `updates/` existentes. Confira se `package.json` está na mesma pasta de `atualizar.sh`. Inicie com `bash atualizar.sh`. Se aparecer LOCK_INVALID, preserve a pasta updates para diagnóstico: não exclua backups nem o diário de aplicação.

Os avisos de `npm audit` são separados do erro de trava. Não execute `npm audit fix --force` como tratamento de STALE_LOCK, pois pode trocar dependências incompatíveis.


## Falha no download ou manifesto — v1.8.3

A mensagem UPDATE_FAILED na etapa download não identificava o arquivo e também podia esconder uma divergência de SHA-256 do manifesto, porque a etapa não era atualizada antes da verificação de integridade. A versão nova distingue DOWNLOAD_HASH_MISMATCH, DOWNLOAD_INVALID_BLOB, RELEASE_HASH_MISMATCH e erros de rede/HTTP. updates/last-error.json inclui o caminho gerenciado do arquivo, sem URLs privadas, tokens ou stderr bruto.

Falhas transitórias de rede/HTTP recebem até três tentativas por endpoint, com esperas de 500ms e 1500ms. Se raw.githubusercontent.com continuar falhando, a fonte alternativa é exclusivamente a API de blobs do mesmo repositório oficial, pelo hash imutável do arquivo. Os bytes sempre precisam corresponder ao hash Git esperado e depois ao manifesto SHA-256; o fallback não desliga nenhuma verificação nem aceita URL enviada pelo chat. Erro de permissão 403 não gera loop de tentativas no mesmo endpoint.

A atualização continua em staging até que todas as verificações passem. Se ambos os caminhos falharem, a versão local permanece. Divergência de manifesto significa publicação incompleta/inconsistente: não remova o manifesto para contornar a proteção. O ZIP atualizado substitui o código mantendo .env, sessions/, data/, storage/ e updates/. Depois inicie com bash atualizar.sh. Não houve mudança no banco ou nas sessões nesta correção.


## Console de comandos e conexão — v1.8.5

O console mostra resumos de comandos recebidos: horário, prefixo/comando, grupo (nome disponível no banco ou JID) e usuário. Exemplo: `[09:45:10] 🐺 CMD !menu | Grupo: Alcateia | Usuário: Ana`. Comandos de plugins e pedidos barrados por cooldown/permissões também aparecem; essa linha confirma recebimento, não execução bem-sucedida. Argumentos e conteúdo das conversas não são impressos. Mensagens comuns sem comando não são copiadas ao console. Dumps de sessão, chaves e ruído de bibliotecas continuam ocultos. Erros reais permanecem visíveis; detalhes estruturados ficam nos logs.

LOG_COMMANDS=true é o padrão mesmo em instalações sem a variável. LOG_COMMANDS=false desliga os resumos; não apaga erros nem os avisos de conexão. LOG_LEVEL controla os demais registros. O pareamento inicial continua pedindo explicitamente o número no console, separado do cadastro dos donos.

O Baileys instalado pode completar o pareamento com account+me, sem registered=true. me.id sozinho não basta: requestPairingCode também cria um me provisório. A nova verificação preserva sessões completas e limpa apenas me/pairingCode de uma tentativa incompleta, mantendo as chaves existentes, para que a biblioteca não tente login com identidade provisória. Não remove pastas nem bancos.

Listeners de conexão e credenciais são instalados antes dos awaits de plugins e pareamento. Gravações são serializadas e concluídas antes da reconexão; falha de gravação impede continuar silenciosamente. O código 515 do transporte é exibido como reinício solicitado pelo WhatsApp, seguido de reconexão, em vez de dump JSON. Outros erros continuam visíveis. Uma sessão salva completa não pede outro código; sem pareamento concluído, gerar código continua sendo necessário.

Reconexões têm tentativas limitadas/backoff, evitam callbacks de sockets antigos e aguardam a inicialização anterior dos plugins. Redis/comandos/ativações são inicializados uma vez por runtime. SIGINT/SIGTERM salvam credenciais e impedem reconexão durante encerramento. O supervisor recebe readiness apenas quando a conexão realmente abre.

A configuração não garante autenticar conta desvinculada, revogada ou bloqueada pelo WhatsApp. A validação automatizada usa eventos/credenciais fictícios; não conecta ao WhatsApp real. Menus, mídia principal, jogos, RP e economia não foram modificados por esta edição.
