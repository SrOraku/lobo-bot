# Missões da Matilha

As missões usam conclusões reais dos jogos, sem contagem de mensagens. O progresso e os resgates ficam no mesmo SQLite dos perfis e da carteira WoK coin, separados por jogador e chat. O progresso começa a contar a partir desta atualização; resultados antigos não são recompensados retroativamente.

```text
!missoes
!missoes diarias
!missoes semanais
!missoes progresso
!missoes resgatar d-treino
```

O prefixo configurado no bot é respeitado. O painel informa o ID, objetivo, progresso e recompensa de cada missão.

| ID | Objetivo | Período | WoK coin | XP |
| --- | --- | --- | ---: | ---: |
| `d-jogos` | Concluir 2 minijogos | Diário | 40 | 20 |
| `d-treino` | Concluir 1 treino da Alcateia Estratégica | Diário | 25 | 15 |
| `d-trabalho` | Concluir 1 expediente da profissão RP | Diário | 30 | 20 |
| `s-jogos` | Concluir 10 minijogos | Semanal | 120 | 70 |
| `s-conhecimento` | Concluir 3 rodadas completas de quiz | Semanal | 90 | 50 |
| `s-cidade` | Concluir 5 expedientes RP | Semanal | 100 | 60 |
| `s-aventuras` | Concluir 2 aventuras com vitória | Semanal | 100 | 60 |

Uma partida interrompida com `parar` não é uma conclusão. Consultar status, simular batalhas ou enviar mensagens não rende progresso. Cooldowns e requisitos dos jogos originais continuam valendo.

As diárias renovam à meia-noite de Brasília, e as semanais na segunda-feira, também à meia-noite. As recompensas ficam limitadas a **95 WoK coin e 55 XP por dia**, mais **410 WoK coin e 240 XP por semana**, por jogador e chat. A moeda é virtual, sem conversão em dinheiro. Uma recompensa não resgatada deixa de estar disponível quando seu período termina.

Após concluir um objetivo, use o ID exibido para resgatar. A carteira e o XP existentes recebem os valores na mesma transação do registro do resgate. Repetir o comando ou reiniciar o processo não paga novamente. Um número LID ainda não confirmado pelo WhatsApp não recebe recompensas; um mapeamento PN/LID confirmado usa a mesma carteira e o mesmo resgate.

## Integração para os serviços

`recordGameEvent(db, {chat,user,event,kind,at,metadata})` é o diário central síncrono dos acontecimentos. Chame-o **dentro da transação que conclui a ação**, depois de validar seu resultado. Ele aceita o SQLite original ou o adaptador de isolamento, identifica o jogador pela carteira confirmada e deduplica permanentemente por chat, usuário, evento e tipo.

Tipos atuais: `arcade_complete`, `quiz_complete`, `adventure_complete`, `training` e `rp_work`. `expedition_complete` e `project_contribution` ficam disponíveis como contrato para futuras fases, mas o catálogo desta fase não exige essas atividades ainda não integradas.

Os eventos de treino e trabalho são produzidos pelo resultado bem-sucedido do serviço da Alcateia, com o identificador real da mensagem. O adaptador de moeda universal os registra dentro da mesma transação e remove os metadados antes de devolver a resposta. O jogo standalone em JSON continua independente de SQLite; não guarda uma fila adicional de eventos.

Não use eventos de mensagem recebida ou um barramento assíncrono para conceder progresso: isso poderia sobreviver a uma ação que falhou. Uma falha real no diário deve fazer a transação inteira voltar ao estado anterior.

Migration aditiva: `016-universal-missions.js`, com tabelas `mission_events` e `mission_claims`. Não altera ou limpa as tabelas antigas. Para recuar o código, preserve essas tabelas; não é necessário apagá-las. Os testes usam somente bancos temporários e cobrem persistência, isolamento, identificadores repetidos, mapeamento PN/LID e falhas durante a transação.
