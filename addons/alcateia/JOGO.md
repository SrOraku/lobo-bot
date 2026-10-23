> **Atualização v1.6.0:** no Lobo Bot integrado, Gold e WOK Coin foram unificados como **WoK coin**. Os saldos antigos são somados uma única vez, na proporção 1:1, por jogador e chat. Economia, RP e Alcateia usam a mesma carteira SQLite. Os comandos antigos continuam válidos; `!carteira`, `!saldo` e `!wok` consultam o saldo universal. Referências históricas abaixo à separação das moedas descrevem versões anteriores. O addon executado isoladamente continua usando seu armazenamento JSON.

# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

**🌹100 LOBISOMENS ESTRATÉGIA🌹**

🐺 Monte sua alcateia, distribua seus lobisomens e dispute batalhas com outros jogadores. O jogo funciona junto dos comandos de administração do bot. As instruções de instalação, conexão e atualização estão no [README](INTEGRACAO.md).

🌹 Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺

## Primeiro acesso

Envie `!start` ao bot para registrar sua conta. O registro usa o nome da sua conta no momento da criação e o número brasileiro confirmado pelo WhatsApp. Cada número tem um perfil independente por grupo; a conversa privada tem seu próprio perfil. O progresso anterior foi copiado como ponto inicial, sem sincronizar avanços posteriores.

A carteira usa **WOK Coin**, moeda fictícia interna compartilhada com o [RP](RP.md). O primeiro registro recebe 100 WOK Coins uma única vez. Se você já iniciou o RP ou já jogava na versão anterior, seu saldo existente é preservado na proporção 1:1. Trabalhos, transferências e compras RP usam essa mesma carteira. A saúde RP é independente do HP da alcateia; remédios RP tratam somente a saúde RP.

O jogo aceita números com DDI **55**, DDD brasileiro válido e telefone de 8 ou 9 dígitos. Quando o WhatsApp usa uma identificação interna, o bot precisa conseguir confirmar o telefone correspondente. Se essa confirmação não estiver disponível no grupo, tente o comando no privado do bot.

| Atributo | Inicial | Limite |
| --- | --- | --- |
| HP | 100 | 100 |
| Lobisomens | 20 | 100 |
| Ataque — A | 10 | 40 |
| Defesa — D | 8 | 40 |
| Contra-ataque — C | 2 | 20 |
| WOK Coins | 100 | Saldo inteiro, sempre igual ou maior que zero |
| Vitórias, derrotas e empates | 0 | Acumulados no perfil |

Use `!perfil` para consultar seus atributos, WOK Coins, posição no ranking, clã, boosts ativos, créditos de treino extra e datas do último treino e batalha. As datas do perfil e do histórico de batalhas usam UTC. Enviar `!start` novamente preserva o perfil existente.

Os exemplos deste manual usam o prefixo padrão `!`. Se ele for alterado em `.env`, use o prefixo configurado.

## Comandos dos jogadores

| Comando | Uso |
| --- | --- |
| `!start` | Registra sua conta. |
| `!perfil` | Consulta seu perfil. |
| `!treino` | Treina e recebe até 5 lobisomens. |
| `!formacao A 10` | Define a quantidade de ataque. Também aceita `D` e `C`. |
| `!ataque @jogador` | Inicia uma batalha imediata contra um jogador mencionado. |
| `!rank` | Exibe os 10 primeiros jogadores. |
| `!loja` | Mostra os itens e preços. |
| `!comprar 1` | Compra o item indicado, de 1 a 4. |
| `!clan criar Lua Vermelha` | Cria um clã por 300 WOK Coins. |
| `!clan entrar Lua Vermelha` | Entra em um clã existente. |
| `!clan perfil` | Mostra o perfil do seu clã. |
| `!evento` | Participa do evento lunar a cada 24 horas. |

Para `!ataque`, use **exatamente uma menção real** ao jogador pelo seletor de contatos do WhatsApp. Os dois participantes precisam estar registrados, sem banimento, com HP acima de zero e fora do tempo de espera de batalha. Atacar a si mesmo é recusado.

`!recusar JID` ou `!recusar telefone` atende às solicitações de entrada em grupos, conforme as permissões administrativas do bot. Convites de família RP usam `!familia aceitar ID` e `!familia recusar ID`.

## Treino e formação

Um treino normal fica disponível a cada **1 hora**. Ele acrescenta até 5 lobisomens, respeitando o total máximo de 100, e distribui os novos lobisomens aleatoriamente entre A, D e C, conforme as vagas disponíveis em cada posição. Se você estiver com 98 lobisomens, o treino acrescenta 2. Com 100, o treino é recusado.

`!formacao` altera somente a posição informada. Os outros valores permanecem como estavam, e a soma **A + D + C não pode superar o total de lobisomens**. Você pode deixar parte deles na reserva, sem atribuição. Cada quantidade deve ser um inteiro igual ou maior que zero e respeitar os limites A 40, D 40 e C 20.

Por exemplo, começando em A 10, D 8 e C 2, você pode mudar para A 12, D 6 e C 2 assim:

```text
!formacao D 6
!formacao A 12
```

A primeira alteração abre duas vagas para a segunda. Aguarde pelo menos 1 segundo entre os comandos. HP e quantidade de lobisomens são atributos separados: o dano da batalha reduz HP e mantém a formação.

## Batalhas

`!ataque @jogador` resolve a batalha imediatamente, usando a fórmula e os limites abaixo.

O dano de cada participante é calculado assim:

```text
Dano = máximo entre 0 e:
(seu Ataque × 1,2) − (Defesa do adversário × 0,8) + (seu Contra-ataque × 0,5)
```

Boosts ativos entram na fórmula. Os dois danos são calculados antes de qualquer redução de HP e aplicados **simultaneamente**. Dano e HP são arredondados a duas casas decimais; o HP fica entre 0 e 100.

### Resultado por faixa de HP

O resultado compara a faixa de HP final dos dois jogadores:

| HP final | Faixa |
| --- | --- |
| Acima de 50 | Alta |
| De 20 a 50, incluindo os limites | Média |
| Abaixo de 20 | Baixa |

Quem termina em uma faixa superior vence. Se os dois terminarem na **mesma faixa**, a batalha é empate, mesmo com HP diferente. Exemplos: 70 × 60 é empate; 51 × 50 dá vitória ao jogador com 51; 20 × 19 dá vitória ao jogador com 20.

| Resultado individual | Mudança nas WOK Coins |
| --- | --- |
| Vitória | +50 |
| Derrota | −25, limitada ao saldo disponível |
| Empate | +10 para cada jogador |

As WOK Coins de uma vitória são criadas como recompensa; a derrota desconta até 25 do perdedor. Os saldos nunca ficam negativos. Cada resultado atualiza o contador correspondente do jogador e é registrado no histórico, com participantes, danos, HP, WOK Coins, conversa, modo e data.

### HP e tempo de espera

O HP é persistente: a próxima batalha começa com o HP deixado pela anterior. Um jogador com **0 HP** não pode iniciar nem receber batalhas. A recuperação ocorre quando o evento lunar sorteia HP ou quando um dono do jogo usa `!admin sethp`.

Após uma batalha, **os dois jogadores** aguardam 5 minutos para outra, inclusive quem participou como defensor. Esse tempo vale em todas as conversas da instância. Reiniciar o bot preserva os horários salvos.

## Loja e boosts

Consulte `!loja` e compre pelo número do item:

| Item | Nome | Preço | Efeito |
| --- | --- | --- | --- |
| `!comprar 1` | Fúria Lunar 🗡️ | 100 WOK Coins | +20% de ataque por 1 hora. |
| `!comprar 2` | Pele de Prata 🛡️ | 100 WOK Coins | +20% de defesa por 1 hora. |
| `!comprar 3` | Instinto Selvagem ⚡ | 150 WOK Coins | +30% de contra-ataque por 1 hora. |
| `!comprar 4` | Treino Alfa 🐺 | 200 WOK Coins | Acrescenta um crédito de treino extra. |

O boost começa na compra e expira pelo horário real, inclusive enquanto o bot estiver desligado. Comprar novamente o mesmo tipo renova a duração para 1 hora a partir da nova compra; o percentual não se acumula. Tipos diferentes podem ficar ativos ao mesmo tempo.

Os boosts alteram os valores usados no combate, sem mudar a formação básica nem consumir lobisomens. `!perfil` mostra os efeitos ativos e o tempo restante.

O Treino Alfa concede um crédito: use `!treino` durante o tempo de espera do treino normal para gastá-lo e ganhar até 5 lobisomens. O crédito **preserva o horário de liberação do treino normal**. Se o treino normal já estiver disponível, `!treino` usa essa oportunidade e mantém o crédito para depois. A compra de Treino Alfa é recusada quando você já tem 100 lobisomens.

## Clãs

Criar um clã custa **300 WOK Coins**, descontadas do criador, que passa a ser o líder. Entrar em um clã existente é gratuito. Cada jogador participa de somente um clã.

O nome deve ter de 2 a 32 caracteres e pode conter letras, números, espaços, `_` e `-`. Nomes são únicos em toda a instância, ignorando diferenças entre maiúsculas e minúsculas; espaços repetidos são normalizados.

```text
!clan criar Lua Vermelha
!clan entrar Lua Vermelha
!clan perfil
```

Os dois primeiros exemplos representam alternativas: quem já está em um clã não consegue criar ou entrar em outro. O perfil mostra nome, líder, quantidade de membros, vitórias, derrotas, WOK Coins e posição no ranking de clãs.

As estatísticas do clã acumulam os resultados das batalhas dos membros enquanto eles pertencem ao clã. Vitórias e derrotas são somadas. O indicador de WOK Coins acumula **somente créditos positivos das batalhas**: +50 por vitória e +10 por empate de cada membro; perdas e compras individuais não o reduzem. Essa pontuação não é um saldo coletivo disponível para compras.

O ranking de clãs considera, nesta ordem: mais vitórias, mais WOK Coins acumuladas, mais membros e menos derrotas. O nome normalizado resolve a ordenação restante.

## Evento lunar

Use `!evento` uma vez a cada **24 horas**, contadas desde a última participação. Um resultado é sorteado entre:

- 80 WOK Coins;
- até 5 lobisomens, respeitando o limite de 100;
- um boost de ataque, defesa ou contra-ataque por 1 hora;
- até 25 HP, respeitando o limite de 100;
- nenhuma recompensa.

O evento pode ser usado mesmo com HP zero. O resultado é aleatório: a recuperação de HP não é garantida. Um boost recebido segue a mesma regra da loja: o mesmo tipo renova a duração e tipos diferentes podem coexistir. O tempo de espera de 24 horas vale para qualquer resultado.

## Ranking dos jogadores

`!rank` mostra até 10 jogadores, excluindo os banidos do jogo. A ordem considera mais vitórias, mais WOK Coins, mais lobisomens e menos derrotas. A identificação do jogador resolve a ordenação restante.

O ranking considera somente os dados do chat atual. A posição mostrada em `!perfil` considera todos os jogadores elegíveis, inclusive quem aparece depois dos 10 primeiros.

## Administração do jogo

Somente as contas **`5543996375955`** e **`5543920030769`** podem usar `!admin`. Os telefones são confirmados pela identidade do WhatsApp; nome do perfil, texto da mensagem ou uma identificação interna sem telefone verificado não concedem esse acesso.

Esses donos são fixos no jogo. Alterar `OWNER_NUMBER` configura o dono dos comandos antigos de administração do bot e não modifica a lista de donos do jogo. Ser administrador de um grupo também não concede acesso a `!admin`.

Nos comandos abaixo, substitua `NUMERO` pelo telefone brasileiro completo do jogador, somente com dígitos e DDI 55. O alvo precisa estar registrado. As quantidades devem ser inteiras.

| Comando | Efeito |
| --- | --- |
| `!admin status` | Mostra tempo ligado, jogadores, batalhas, clãs, memória e tempo interno de processamento. |
| `!admin addmoedas NUMERO 100` | Acrescenta uma quantidade positiva de WOK Coins. |
| `!admin removemoedas NUMERO 50` | Desconta uma quantidade positiva, desde que haja saldo suficiente. |
| `!admin ban NUMERO` | Bane o jogador do RP e da alcateia, preservando seus dados. |
| `!admin unban NUMERO` | Remove o banimento do jogo. |
| `!admin backup` | Cria uma cópia do banco na pasta de backups. |
| `!admin broadcast Mensagem` | Envia a mensagem no privado dos jogadores registrados e não banidos. Até 2.000 caracteres. |
| `!admin resetcooldown NUMERO` | Libera treino normal, batalha e evento do jogador. |
| `!admin sethp NUMERO 100` | Define HP de 0 a 100. |
| `!admin addlobos NUMERO 5` | Acrescenta de 1 a 100 lobisomens solicitados, respeitando o total máximo de 100 e distribuindo-os na formação. |

O banimento do jogo preserva o perfil e seus dados. `!admin ban` atua no jogo; o comando antigo `!ban` administra a participação no grupo. Remover o banimento permite que o jogador retome o perfil existente.

`!admin resetcooldown` preserva a cota de comandos por hora. As alterações administrativas também podem ser aplicadas a um perfil banido. Os donos não precisam criar um perfil próprio para usar os comandos administrativos.

O broadcast confirma a posição na fila e envia as mensagens em segundo plano, com intervalo entre os destinatários. A moderação continua atendendo o grupo durante os envios; ao terminar, o bot informa quantos foram concluídos ou falharam. Parar o processo pode interromper os avisos ainda pendentes. O backup manual informa o nome do arquivo salvo; uma falha na cópia é informada sem encerrar o bot.

## Limites de uso e persistência

Todos os comandos novos do jogo, incluindo `!admin`, compartilham por usuário um limite de **1 comando por segundo** e **50 comandos em uma janela móvel de 1 hora**. A contagem é individual por chat, entre grupos e privados e inclui os donos. Cada comando admitido nessa cota conta mesmo quando a ação é recusada por saldo, sintaxe, permissão ou tempo de espera. Tentativas bloqueadas pela própria cota não acrescentam outra entrada.

O bot responde com o tempo restante quando esse limite é atingido. Os comandos antigos de grupo mantêm suas proteções próprias. As restrições configuradas no grupo, como bot pausado e uso de comandos somente por administradores, continuam se aplicando ao atendimento naquela conversa.

| Ação | Tempo de espera |
| --- | --- |
| Comando do jogo | 1 segundo entre comandos, até 50 em 1 hora |
| Treino normal | 1 hora por jogador |
| Nova batalha | 5 minutos para cada participante |
| Evento lunar | 24 horas por jogador |
| Boost de combate | Duração de 1 hora |

Perfis, clãs, saldos, HP, boosts, horários, limites, dados RP e histórico de batalhas ficam no banco indicado por `DATA_FILE`. O bot grava as ações do jogo em sequência, inclusive quando chegam de conversas diferentes. RP e alcateia usam a mesma cota de comandos e o mesmo saldo.

Há um backup automático a cada 6 horas enquanto o processo estiver em execução. Ele inclui o banco de grupos e jogo e deixa a sessão do WhatsApp e `.env` fora da cópia. A pasta padrão é `./backups`, configurável por `BACKUP_DIR`. Veja os passos de [atualização e restauração no README](README.md#backups-e-restauração).

🌹 Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
