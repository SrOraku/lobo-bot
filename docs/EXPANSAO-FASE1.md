# 🌹 LOBO-BOT — expansão funcional da Fase 1 🐺

Nome oficial preservado: **🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑**. A versão do pacote continua `1.0.0`; a entrega é identificada pelo commit e pelo manifesto.

Este documento descreve somente os sistemas encontrados e implementados nesta fase. Os exemplos usam `!`; o prefixo configurado pela instalação é respeitado.

## 1. Diagnóstico e referência

A análise começou na `main` em **`a5cef10eedbe7593ba6a8b9732e57b9acc59050f`**, que já continha a Guerra de Alcateias da PR #13. Antes da expansão, as correções de download automático e de edição/reutilização do painel de ativações foram validadas e integradas pela **PR #14**, merge **`c3c38d610dbdc0023ca37ad40c42facfd1a8a61e`**. A integração foi atualizada para a `main` em `4eccdab375f8b460427a1ae3e31ffffe30b2e1c3`, preservando console, bônus de entrada único, agendamentos, clãs e sorteios das PRs #15–#18. As migrations 15/16 publicadas foram mantidas; as novas usam 17–21. A expansão é desenvolvida na branch `feat/expansao-fase1-integrada`, em commits separados.

Já existiam: 100 Lobisomens clássico; Alcateia Estratégica; guerra semanal de sete territórios; Cidade RP e suas 64 profissões; famílias; carteira universal de WoK coin por jogador/chat; lojas e equipamentos; conquistas; quiz, forca, Akinator, aventura, Gartic e os outros minijogos registrados.

Nesta fase foram acrescentadas formações nomeadas, simulação pela fórmula existente, missões com diário de acontecimentos, quiz por categoria e torneios, histórico e recordes dos minijogos. Forca, Akinator, aventura, Gartic e cinco módulos de minijogos receberam melhorias. As rotas clássicas continuam acessíveis; os novos modos não exigem criar outro perfil ou outra carteira.

## 2. Implementação e guia de uso

### 100 Lobisomens: formações e simulação

```text
!estrategia
!mudar estrategia ataque:40 defesa:35 contra:25
!estrategia salvar Patrulha Lunar
!estrategia listar
!estrategia usar Patrulha Lunar
!estrategia excluir Patrulha Lunar
!simularbatalha
!simularbatalha 40 35 25
!simularbatalha Patrulha Lunar
!taticas
!historicolobos
!historicolobos 2
```

- Uma formação salva contém os três números atuais, cuja soma permanece em 100. Há até **20 formações por jogador/chat**, com nomes de até 32 caracteres e comparação normalizada para evitar duplicatas por maiúsculas/acentos.
- `usar` troca apenas a distribuição; não cura lobos, não reinicia estatísticas, não muda cooldown e não movimenta saldo.
- `!estrategia` e seu alias anterior continuam mostrando a estratégia clássica. O comando `!mudar` mantém sua função anterior.
- A simulação reutiliza `calculateBattle`, com a mesma fórmula e variação aleatória do combate clássico. O adversário é uma formação fictícia equilibrada de treinamento, uma distribuição informada ou uma das próprias formações salvas. Não consulta a estratégia de outro jogador.
- A simulação não grava resultados oficiais e não altera HP, lobos vivos, saldo ou cooldown. As métricas mostram força ofensiva, resistência e base de contra-ataque, com vantagens e vulnerabilidades. Uma distribuição não garante vitória.
- O histórico é pessoal, em páginas de cinco, e lê os registros reais de batalhas daquele chat sem revelar formações adversárias.

Arquivos principais: `src/wolves/strategies.js` e `src/commands/wolf-strategies.js`. [Regras detalhadas](ESTRATEGIAS-SALVAS.md).

### Missões diárias e semanais

```text
!missoes
!missoes diarias
!missoes semanais
!missoes progresso
!missoes resgatar d-treino
```

As missões contam **ações concluídas**, não volume de mensagens: finalizar minijogos, completar um treino da Alcateia, trabalhar na profissão RP, completar quizzes e vencer aventuras. O painel informa ID, objetivo, progresso e recompensa.

| ID | Objetivo | Período | WoK coin | XP |
| --- | --- | --- | ---: | ---: |
| `d-jogos` | Concluir dois minijogos | Diário | 40 | 20 |
| `d-treino` | Concluir um treino da Alcateia | Diário | 25 | 15 |
| `d-trabalho` | Concluir um expediente RP | Diário | 30 | 20 |
| `s-jogos` | Concluir dez minijogos | Semanal | 120 | 70 |
| `s-conhecimento` | Concluir três partidas completas de quiz | Semanal | 90 | 50 |
| `s-cidade` | Concluir cinco expedientes RP | Semanal | 100 | 60 |
| `s-aventuras` | Vencer duas aventuras | Semanal | 100 | 60 |

O teto é de **95 WoK coin e 55 XP diários**, mais **410 WoK coin e 240 XP semanais**, por jogador/chat. Diárias renovam à meia-noite de Brasília; semanais, na segunda-feira à meia-noite. É preciso resgatar dentro do período. A carteira e o XP existentes recebem a recompensa junto com o registro único do resgate, na mesma transação.

O progresso começa nos acontecimentos posteriores à atualização. Simular, consultar status ou cancelar uma partida não completa objetivos. Em modos cooperativos, a simples inscrição sem participação não rende progresso. Não há pagamento retroativo de resultados antigos.

Arquivos principais: `src/missions/catalog.js`, `src/missions/service.js` e `src/commands/missions.js`. [Catálogo, limites e contrato de integração](../src/missions/README.md).

### Quiz: categorias, dificuldades e torneios

```text
!quiz categorias
!quiz iniciar ciencia facil
!quiz partida
!quiz resposta 2 1
!quiz encerrar
!quiz historico 1
!quiz ranking
!quiz ranking ciencia

!quiz torneio criar geografia medio
!quiz torneio entrar
!quiz torneio iniciar
!quiz torneio responder 3 1
!quiz torneio status
!quiz torneio ranking
!quiz torneio sair
!quiz torneio cancelar
```

Há **60 perguntas estruturadas**, com explicações, em `ciencia`, `matematica`, `tecnologia` e `geografia`. Cada categoria tem dificuldades `facil`, `medio` e `dificil`, com cinco perguntas por combinação. São 10/15/20 pontos de jogos por acerto; as perguntas da combinação são embaralhadas.

No novo modo, uma resposta tem **OPÇÃO e RODADA**: `!quiz resposta 2 1` escolhe a alternativa 2 da rodada 1. Isso impede que uma resposta atrasada seja aplicada à pergunta seguinte. O estado é retomado com `!quiz partida` após reinícios. O quiz original com `!quiz`, respostas numéricas, `status`, `parar` e `iniciar` sem categoria permanece disponível.

Torneios ocorrem em grupos, com **dois a dez participantes voluntários**. O organizador inicia ou cancela; inscrições expiram em 30 minutos. São cinco rodadas, uma resposta por membro em cada rodada. A rodada avança após todos responderem ou ao vencerem dois minutos. O prazo é conferido ao receber um comando; não há avisos periódicos em segundo plano. O número da rodada também é obrigatório nas respostas do torneio.

Os quizzes de categoria e torneios compartilham um teto de **200 pontos de jogos por jogador/chat/dia**. Há cinco minutos entre partidas individuais e dez minutos entre torneios encerrados do grupo. Esses pontos alimentam o placar de minijogos existente; não são uma segunda moeda e não são WoK coin. O ranking semanal por categoria usa semanas iniciadas na segunda-feira, à meia-noite de Brasília. A troca de semana não apaga o placar geral nem o histórico.

Arquivos principais: `src/games/quiz/catalog.js`, `src/games/quiz/service.js` e `src/commands/quiz-expanded.js`. [Guia completo do quiz](../src/games/quiz/README.md).

### Forca: temas, dificuldades e cooperação

```text
!forca temas
!forca iniciar natureza facil
!forca pista
!forca cooperativa iniciar fantasia normal
!forca cooperativa entrar
!forca cooperativa status
!forca cooperativa a
!forca cooperativa parar
```

O catálogo foi ampliado para **56 palavras**, com temas `matilha`, `natureza`, `astronomia`, `ciencia`, `cidade`, `fantasia` e `todos`. As palavras anteriores mantêm suas posições para compatibilidade com sessões antigas.

| Dificuldade | Erros permitidos | Pontos na vitória |
| --- | ---: | ---: |
| Fácil | 8 | 25 |
| Normal | 6 | 30 |
| Difícil | 4 | 40 |

É possível pedir uma pista uma vez após dois erros. A pista revela uma letra e reduz dez pontos do prêmio. A forca original continua aceitando letras e os comandos anteriores.

Na cooperativa, até dez jogadores entram voluntariamente e compartilham a palavra e os erros. A sessão dura até 20 minutos, com intervalo de dois segundos por participante entre ações. Na vitória, cada participante que acertou ao menos uma letra recebe 20 pontos de jogos; apenas entrar não dá prêmio. Quem iniciou ou um administrador pode interromper sem recompensa. A rodada é independente da forca individual.

### Akinator, aventura e demais minijogos

O Akinator local passa a ter **56 candidatos e 65 perguntas/atributos**, com escolha de perguntas para separar hipóteses. Os índices anteriores foram preservados. Não é uma integração oficial com a API comercial do Akinator e não depende de serviço externo.

```text
!aventura capitulos
!aventura iniciar classica
!aventura iniciar cristais
!aventura inventario
!aventura 1
!aventura status
```

As três trilhas e oito finais da aventura clássica continuam disponíveis. A campanha opcional **O Farol de Cristal** tem três capítulos, oito locais, inventário e decisões persistentes. Corda, unguento, inscrição e cristal liberam passagens específicas. Há três finais de vitória, com 55 pontos de jogos; após 24 decisões sem chegar a um final, o retorno prudente encerra a jornada com cinco pontos. Isso é uma expansão da aventura existente, não o RPG futuro Crônicas de Oraku.

Os comandos abaixo acrescentam dificuldades aos módulos que efetivamente as utilizam:

```text
!memoria iniciar dificil
!matematica iniciar dificil
!anagrama iniciar facil
!reacao iniciar facil
!digitacao iniciar dificil
```

Memória varia a quantidade de pares; Matemática inclui multiplicação/subtração na dificuldade maior; Anagrama varia o tamanho da palavra e evita uma mistura idêntica à resposta; Reação varia a janela de resposta; Digitação varia frase e prazo. Os comandos sem opções continuam com os modos anteriores. As mecânicas de 2048, Velha, Jokenpô, Caça-Palavras e demais módulos existentes foram preservadas e passam a aproveitar o histórico comum de conclusões.

### Gartic: categorias, dicas e temporadas

```text
!gartic categorias
!gartic iniciar 3 animais
!gartic pista
!gartic proxima
!gartic status
!gartic ranking
!gartic ranking temporada
!gartic ranking temporada natureza
!gartic parar
```

Gartic oferece as categorias `geral`, `animais`, `natureza`, `objetos` e `fantasia`, com 56 palavras no catálogo por categoria. O desenhista recebe a palavra no privado e continua enviando o desenho no grupo. Pode escolher de uma a dez rodadas. As dicas revelam mais informação após 40 e 80 segundos, dentro dos dois minutos da rodada.

O ranking geral anterior permanece disponível. A consulta `ranking temporada [categoria]` usa uma temporada semanal própria, sem apagar os pontos anteriores. O prêmio existente por primeiro acerto continua sendo **40 WoK coin, 20 XP e 30 pontos de jogos**. Um identificador de rodada impede pagar duas vezes a mesma resposta; o próprio desenhista não recebe prêmio por adivinhar sua palavra.

### Históricos e recordes

```text
!historicojogos
!historicojogos forca 2
!recordes
!recordes memoria
!historicolobos 2
!quiz historico 2
```

O histórico comum de minijogos mostra resultados pessoais em páginas de oito, incluindo vitórias, pontos, ações e horário. Os recordes agregam partidas, vitórias, maior prêmio e, quando disponível, melhor placar/tempo. Os históricos de lobos e do quiz de categoria possuem consultas próprias. Somente os resultados registrados a partir desta atualização aparecem nas novas tabelas; o sistema não inventa partidas antigas.

## 3. Banco de dados, compatibilidade e recuperação

Todas as alterações são migrations **aditivas**, no mesmo SQLite já utilizado pelo bot. O carregador inclui os módulos numerados de `src/config/migrations/` em ordem. O histórico de migrations registra cada versão na mesma transação da criação de suas tabelas.

| Migration | Novas tabelas | Finalidade |
| --- | --- | --- |
| 17 — `saved_wolf_strategies` | `saved_wolf_strategies`, `wolf_strategy_operations` | Formações nomeadas e deduplicação das operações |
| 18 — `universal_daily_weekly_missions` | `mission_events`, `mission_claims` | Acontecimentos reais e resgates únicos por período |
| 19 — `quiz_categories_and_tournaments` | `quiz_plus_sessions`, `quiz_tournaments`, `quiz_plus_events`, `quiz_plus_results` | Quiz por categoria, inscrições, prazos, pontuação e classificação |
| 20 — `arcade_history_records_coop` | `phase1_arcade_results`, `phase1_arcade_coop` | Resultados pessoais e sessões cooperativas |
| 21 — `gartic_categories_and_seasons` | `phase1_gartic_results`, `phase1_gartic_actions` | Classificação por temporada e proteção contra repetição |

As migrations não apagam nem renumeram perfis, clãs, famílias, inventários, lobos, profissões ou saldos antigos. As novas tabelas possuem chaves por chat e jogador quando aplicável, além de identificadores de operação/partida. O histórico de minijogos não substitui o placar anterior.

Não há migration destrutiva de retorno automático nesta fase. Para voltar ao código anterior, preserve as tabelas novas e os dados existentes; tabelas adicionais podem permanecer sem uso. Uma restauração integral do banco só deve utilizar backup consistente, com o bot parado e com ciência de que substituir o banco também reverte o progresso posterior ao backup.

## 4. Testes e validação

Verificações específicas já executadas durante o desenvolvimento:

| Componente | Resultado local conhecido |
| --- | --- |
| Formações salvas e simulação | 9 testes aprovados |
| Missões e resgates | 11 testes aprovados |
| Quiz por categoria e torneios | 15 testes aprovados |
| Gartic | 10 testes aprovados |
| Evolução do arcade | 12 testes aprovados |
| Migração de banco legado preenchido | 1 teste aprovado |

Os testes cobrem bancos temporários, reabertura do SQLite, isolamento dos chats, formação e nomes, simulação sem escrita, repetição de mensagens, limite de pontos, inscrições voluntárias, PN/LID, prazos, transações concorrentes e reversão integral quando a persistência da recompensa ou da missão falha. Uma falha de missão dentro de uma conclusão deve reverter também seu resultado e pontuação.

**Validação local consolidada:** `npm run check` passou no Node 24.22.1 com **1.097 testes, zero falhas**, além de lint de todo o projeto, sintaxe, plataforma e inicialização. O manifesto é regenerado e conferido antes da publicação. A auditoria mantém a exceção Zod já documentada pelo projeto; ela não foi ampliada. A integração na `main` depende também da aprovação das verificações do GitHub sobre o commit final; consulte os resultados da PR correspondente.

Não houve teste desta expansão numa conversa real do WhatsApp. O transporte é simulado nos testes automatizados; regras, persistência e transações são executadas de verdade. Nenhuma conta, sessão, banco ou chave de produção foi utilizada como massa de teste.

## 5. Documentação e arquivos integrados

- Estratégias: [docs/ESTRATEGIAS-SALVAS.md](ESTRATEGIAS-SALVAS.md), `src/wolves/strategies.js`, `src/commands/wolf-strategies.js` e migration 17.
- Missões: [src/missions/README.md](../src/missions/README.md), catálogo/serviço/comando próprios e migration 18. Os produtores de acontecimentos nos jogos e no adaptador de moeda universal gravam o diário dentro de suas transações.
- Quiz: [src/games/quiz/README.md](../src/games/quiz/README.md), catálogo/serviço próprios, wrapper de comando e migration 19.
- Arcade: `src/games/engine.js`, `content.js`, `characters.js`, `service.js`, `history.js`, `forca-coop.js`, `adventure-expansion.js`, módulos de jogos e `src/commands/arcade-expanded.js`; migration 20.
- Gartic: `src/games/gartic.js` e migration 21.
- Integração: carregamento de migrations e registro dos comandos em `src/handlers/commands.js`. Os registros utilizam as categorias existentes para aparecer nos submenus, preservando o menu principal compacto, o prefixo e os aliases anteriores.

## 6. Pendências e fases seguintes

Esta entrega não registra comandos falsos para funcionalidades futuras. As fases seguintes ainda não foram implementadas por esta Fase 1:

- **Fase 2:** novos efeitos dos territórios, estruturas da guerra, dificuldade/IA estratégica da Alcateia Sombria, cargos e projetos de clã, expedições e chefes cooperativos.
- **Fase 3:** empresas com contratação consentida, construções da cidade, mercado de itens entre jogadores e Colônias da Matilha.
- **Fase 4:** Crônicas de Oraku, assistente/narrador e geração de imagens por provedor configurado.
- **Especializações dos 100 lobos:** Guardião da Lua, Caçador Sombrio e demais especializações propostas não fazem parte das formações salvas desta fase. Não foram apresentadas como bônus já ativos.
- Não foram criados títulos/insígnias exclusivos para cada minijogo nem torneios de todos os módulos. Os títulos e conquistas que já existiam continuam válidos; a nova entrega acrescenta recordes e o campeonato de quiz descritos acima.
- A calibração com jogadores reais e a validação de envio/edição em diferentes dispositivos WhatsApp continuam necessárias. Os sistemas desta fase funcionam sem API de IA; nenhuma integração externa foi simulada como se estivesse disponível.

## 7. Segurança e preservação

- A identidade oficial, nome, símbolos, assinatura, dono principal e privilégios permanecem fora das alterações desta fase.
- Os serviços existentes de 100 Lobisomens, Alcateia Estratégica, guerra, Cidade RP e carteira universal são reutilizados. Os pontos de minijogos são uma classificação já existente, sem conversão financeira; WoK coin continua a única moeda virtual da economia.
- Salvar/usar formações, finalizar jogos e resgatar missões validam identidade e isolamento. Identificadores LID precisam de correspondência de telefone confirmada para as novas operações pessoais e recompensas.
- Eventos e resgates são idempotentes e transacionais. Reiniciar ou reenviar mensagens não autoriza duplicar resultados. Participação em cooperativas e torneios é voluntária e não concede nenhum privilégio administrativo no WhatsApp.
- Não há alteração de `.env`, sessões, credenciais, backups ou dados privados para instalar conteúdo de jogos. Não há biblioteca nova para esses sistemas, nem API externa obrigatória.
- O diário central de missões é síncrono e faz parte da transação da ação. Um evento assíncrono de mensagem recebida não é tratado como prova de vitória, treino ou expediente.

## 8. Atualização segura e retorno

1. Aguarde a fase estar validada e integrada à versão que será instalada. Registre o commit atual da instalação com `git rev-parse HEAD` e mantenha uma cópia do código/lockfile dessa versão.
2. Pare o bot e a reinicialização automática da hospedagem. Faça backup privado de `.env`, `data/`, `sessions/`, `auth/` se utilizada, `storage/` e configurações existentes. Preserve também volumes externos utilizados pela instalação.
3. Com o bot parado, copie a pasta do banco inteira, incluindo arquivos `-wal` e `-shm` que ainda existirem. Não faça uma cópia isolada do arquivo `.db` enquanto o processo estiver escrevendo. Para backup com o processo ativo, use a operação oficial de backup do SQLite ou snapshot consistente da hospedagem.
4. Em instalação por Git, após a publicação da fase na `main`:

```bash
git pull --ff-only origin main
npm run release:verify
npm run check:startup
npm start
```

5. Esta fase não acrescenta dependências. Se o lockfile da versão instalada exigir reinstalação, use o procedimento do projeto com `npm ci` antes das verificações. Na validação de desenvolvimento/CI, execute também `npm run check` com as dependências de desenvolvimento disponíveis.
6. Instalações por ZIP devem substituir somente arquivos de código. Preserve as pastas privadas e o `.env`; não envie uma pasta `data/` vazia por cima da instalação para “começar a atualização”. O primeiro início aplica as migrations pendentes.
7. Confira um perfil antigo e o saldo no chat correto, uma formação salva, o painel de missões e uma partida de teste. Outro grupo e o privado precisam conservar seus estados independentes. Não use comandos de reset para verificar a atualização.
8. Se a inicialização falhar, pare o bot, preserve logs e backup e recoloque o código anterior validado. Não apague o banco, sessões, `updates/` ou o histórico de migrations para forçar a inicialização. Falhas ocorridas dentro de uma migration SQLite são revertidas por sua transação; as versões já aplicadas não são executadas novamente.

O comando de inicialização permanece `npm start`, com Node suportado pelo projeto. A expansão não exige parear o WhatsApp novamente nem reenviar credenciais.
