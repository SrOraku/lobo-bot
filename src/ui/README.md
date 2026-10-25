# LOBO BOT — interface 🌹 & 🐺

A apresentação é compartilhada pelos menus e comandos em `text.js`. O addon independente tem seu equivalente ESM em `addons/alcateia/src/presentation.js`, mantendo a execução sem depender do bot principal. A versão oficial permanece 1.0.0; commits e hashes identificam cada atualização.

## Contratos de apresentação

- Molduras simétricas, com 🌹 e 🐺, até 26 colunas visuais. Emojis, grafemas combinados e caracteres largos são considerados. Fontes de cada cliente WhatsApp ainda podem variar.
- `card`, `block`, `center` e `titleRows` preservam textos e dividem cabeçalhos longos sem truncar conteúdo.
- `mono`, `command`, `badge` e `numericText` separam rótulos, argumentos e valores. Badges de ativação contêm apenas o círculo de estado. URLs, JIDs, menções e código existente não são reescritos.
- `progress` calcula somente a barra de apresentação, sem alterar a grandeza original. `money` usa WoK coin por padrão; aceitar outro símbolo no formatter não cria dinheiro real nem outra economia.
- `greeting` e `clock` recebem um instante e fuso; o padrão é America/Sao_Paulo. Os perfis usam os valores disponíveis no contexto, sem novas consultas SQL.
- Descrições e metadados originais de mídia continuam integrais. Respostas cadastradas e legendas personalizadas do usuário não passam por uma substituição global.

## Confirmações

!ativacoes exibe somente recursos reais do registro. Use !ativacoes antilink para selecionar pelo nome; `1` confirma e `2` cancela. A seleção numérica antiga continua disponível. O painel não altera o estado ao ser aberto ou ao selecionar uma função. O Manager continua validando autorização, dependências e transação na confirmação.

A barra mostra a proporção de funções disponíveis naquele grupo. Pendências continuam explícitas. Não mede uma garantia absoluta de proteção. Os setores permanecem informativos.

Dias de inatividade, IDs de itens e respostas de jogos não se tornam confirmações: seus valores e intervalos continuam os mesmos. Comandos explícitos de estado aceitam on/off e 1/2; 0 permanece como alias legado de desligado.

## Interações

`reactions.js` envolve somente a execução visual dos handlers. Reações usam o JID e a chave real da mensagem, possuem prazo e histórico limitado, e não bloqueiam o processamento se a rede falhar. ✅ indica que o handler terminou; a resposta do comando continua sendo a fonte para saber o resultado da ação. Rejeições propagadas não recebem essa marca.

Frases variam usando crypto independente do RNG das partidas. A apresentação nunca chama Math.random para variar uma frase e não altera as chances dos jogos. O histórico de frases é pequeno e não contém usuários ou conversas.

## Continuar em outra conta do ChatGPT

O código pertence à conta GitHub SrOraku em https://github.com/SrOraku/lobo-bot. Conecte essa conta GitHub à outra conta do ChatGPT, abra o repositório e informe a tarefa. As conversas e arquivos temporários do ChatGPT não são transferidos automaticamente.

Guarde o ZIP e backups privados de .env, sessions/, data/ e storage/ em local sob seu controle. Não publique esses dados no GitHub. As sessões e bancos da hospedagem não são substituídos por esta atualização visual.

Leia README.md, MENUS.md, SECURITY.md e os testes antes de mudanças futuras. Preserve versão 1.0.0, identidades PN/LID, isolamento por chat, WoK coin, progresso, aliases e o fluxo 1 SIM/2 NÃO. Não altere a lógica econômica para mudar somente o visual.
