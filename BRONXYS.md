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
