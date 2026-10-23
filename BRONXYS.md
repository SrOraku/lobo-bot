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
