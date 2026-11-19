# Formações salvas e simulação dos 100 Lobisomens

Esta expansão usa o jogo clássico de **100 lobos** (`!atacar`), sem substituir a Alcateia Estratégica (`!ataque`). Os valores continuam divididos em ataque, defesa e contra-ataque, somando exatamente 100.

## Comandos

```text
!estrategia                     mostra a estratégia como antes
!mudar estrategia ataque:40 defesa:35 contra:25
!estrategia salvar Lua Ofensiva  salva a distribuição atual
!estrategia listar              lista suas formações neste chat
!estrategia usar Lua Ofensiva    aplica uma formação salva
!estrategia excluir Lua Ofensiva remove somente essa formação salva
!simularbatalha                 usa uma formação equilibrada de treinamento
!simularbatalha 40 35 25         usa a distribuição informada como treinamento
!simularbatalha Lua Ofensiva     usa uma de suas próprias formações como treinamento
!taticas                        mostra as forças e vulnerabilidades da sua distribuição
!historicolobos [página]         lista suas batalhas reais neste chat
```

Se o prefixo do bot for outro, substitua `!` pelo prefixo configurado. `!strategy`, o comando antigo `!mudar` e os demais comandos originais continuam disponíveis.

## Regras das formações

- Até **20 formações por jogador e por chat**. O mesmo jogador tem listas independentes em grupos diferentes e no privado.
- Nomes de 1 a 32 letras, números, espaços, hífens ou sublinhados. Maiúsculas e acentos não criam nomes distintos: “Lua Ágil” e “LUA AGIL” identificam o mesmo nome.
- Salvar um nome existente é recusado; exclua a versão anterior ou escolha outro nome.
- Usar uma formação muda apenas ataque, defesa e contra-ataque. Não cura lobos, não reinicia cooldown, não muda saldo/XP e não reinicia estatísticas.
- Excluir uma formação salva não altera a distribuição atualmente equipada.
- Ações são gravadas em uma transação junto do identificador da mensagem. Reenvio da mesma mensagem não salva/exclui duas vezes nem reaplica uma formação antiga.
- Identidades LID precisam estar vinculadas a um telefone confirmado pela carteira universal existente. Dígitos de LID não são interpretados como telefone.

## Como a simulação funciona

O simulador chama a **mesma função `calculateBattle` usada no combate clássico**, com a mesma variação aleatória. Não cria uma batalha oficial e não lê a formação de nenhum adversário.

Sua formação usa seus lobos vivos atuais; a formação de treinamento tem 100 lobos. O alvo é sempre a distribuição equilibrada padrão, uma distribuição informada por você ou uma formação da sua própria lista. Não há consulta por menção ou acesso às listas de outros jogadores.

As métricas exibidas seguem os componentes da fórmula existente:

- força ofensiva: ataque + 30% do contra-ataque;
- resistência: defesa + 50% do contra-ataque;
- base de contra-ataque: quantidade de lobos em contra-ataque. O dano de resposta também depende da formação contrária.

Os pontos fortes e vulnerabilidades são sugestões baseadas na distribuição, não garantias de vitória. O resultado varia entre execuções, como ocorre no combate real. A simulação não grava resultados, não paga recompensas e não altera HP, saldo, XP, lobos vivos ou cooldown.

## Histórico e compatibilidade

`!historicolobos` reaproveita o registro de batalhas já existente e apresenta cinco resultados por página, somente do próprio jogador e do chat atual. Mostra o papel na batalha, resultado, data e lobos antes/depois, sem revelar estratégias adversárias. Registros anteriores são mantidos.

A migration aditiva **17, `saved_wolf_strategies`**, cria apenas `saved_wolf_strategies` e `wolf_strategy_operations`, com um índice para consulta por dono. Ela não altera nem limpa tabelas antigas. Uma volta ao código anterior mantém essas novas tabelas sem uso; não as apague enquanto quiser preservar as formações salvas.

Especializações com bônus de combate não fazem parte desta entrega: a fórmula existente permanece a mesma.
