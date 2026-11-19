# Quiz por categoria e torneios da matilha

O quiz original permanece disponível com `!quiz`, suas respostas numéricas, `status`, `parar`, `novo` e `iniciar`. A expansão possui sessões próprias e não substitui as partidas anteriores.

## Quiz individual

```text
!quiz categorias
!quiz iniciar ciencia facil
!quiz partida
!quiz resposta 2 1
!quiz encerrar
!quiz historico
!quiz historico 2
!quiz ranking
!quiz ranking ciencia
```

Categorias: `ciencia`, `matematica`, `tecnologia` e `geografia`. Dificuldades: `facil`, `medio` e `dificil`. O catálogo tem 60 perguntas, cinco para cada combinação de categoria e dificuldade, com explicações. Cada partida utiliza as cinco perguntas da combinação, embaralhadas.

Em `!quiz resposta OPÇÃO RODADA`, o primeiro número é a alternativa de 1 a 4 e o segundo é a rodada exibida. Esse número de rodada impede que uma resposta atrasada avance outra pergunta. `!quiz partida` retoma o estado salvo mesmo após reiniciar o bot. `!quiz encerrar` cancela sem recompensa.

Cada acerto vale 10, 15 ou 20 **pontos de jogos** conforme a dificuldade. São os pontos do placar de minijogos existente, sem WoK coin, dinheiro real ou apostas. Os quizzes de categoria e torneios compartilham um teto de 200 pontos por jogador/chat/dia. O intervalo entre partidas individuais é de cinco minutos, inclusive após cancelar. O limite não altera as regras anteriores do quiz original.

## Torneio multiplayer

```text
!quiz torneio criar geografia medio
!quiz torneio entrar
!quiz torneio sair
!quiz torneio iniciar
!quiz torneio responder 3 1
!quiz torneio status
!quiz torneio ranking
!quiz torneio cancelar
```

Há um torneio ativo por grupo, para dois a dez participantes. O criador já está inscrito; outros jogadores entram voluntariamente. Somente o organizador inicia ou cancela. É possível sair antes de iniciar. O lobby expira após 30 minutos; partidas encerradas exigem dez minutos de intervalo antes do próximo torneio.

São cinco rodadas, com uma resposta por participante em cada rodada. Todos recebem a mesma pergunta. O bot não publica respostas ou acertos individuais enquanto o torneio está em andamento. A rodada avança quando todos responderem ou quando atingir dois minutos. Os prazos são conferidos ao receber comandos do torneio, sem notificações periódicas em segundo plano. Se o bot ficar desligado, uma consulta posterior aplica apenas as cinco rodadas válidas; respostas ausentes valem zero.

O comando `!quiz torneio responder OPÇÃO RODADA` exige o número da rodada atual. Para conferir a rodada depois de uma demora, use `!quiz torneio status`. Jogadores que não se inscreveram não podem responder. Após o encerramento, as respostas ficam bloqueadas e a pontuação não pode ser paga novamente.

## Campeonato, histórico e missões

`!quiz ranking [CATEGORIA]` reúne os resultados individuais e dos torneios da semana, de segunda-feira à meia-noite de Brasília até a próxima segunda. A troca da semana apenas muda a consulta; não apaga histórico nem o placar geral. `!quiz historico [PÁGINA]` mostra somente as próprias partidas, em páginas de cinco.

Concluir uma partida individual gera acontecimentos `quiz_complete` e `arcade_complete` no sistema universal de missões. No torneio, isso ocorre uma vez por jogador que respondeu ao menos uma pergunta; apenas inscrever-se e esperar não completa missões. Os acontecimentos e os resultados são gravados na mesma transação. Resgates continuam sob as regras e limites das missões.

O progresso, inscrições, resultados e limites persistem no SQLite. IDs de mensagens e IDs de partidas impedem pontuação duplicada. Cada chat mantém suas próprias partidas e classificações. Identidades LID precisam estar vinculadas a um telefone confirmado na carteira universal para participar.

Não há dependência de API externa para perguntas, regras ou resultados.
