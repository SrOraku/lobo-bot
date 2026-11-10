# Lojas e vida na matilha

As novidades ampliam os catálogos existentes: 16 itens na Matilha, 12 na Alcateia e 50 no RP. IDs, preços e efeitos dos produtos antigos são mantidos. A carteira WoK coin é compartilhada entre os modos dentro do mesmo chat; outro grupo ou o privado mantém seu próprio saldo.

## Escolher uma loja

| Loja no bot integrado | Consultar | Comprar |
| --- | --- | --- |
| Matilha e combate clássico | `!loja [categoria] [página]` | `!comprar ID` |
| Alcateia, HP e formação | `!lojaalcateia [página]` | `!compraralcateia ID` |
| Cidade RP e pertences | `!rploja [categoria] [página]` | `!rpcomprar ITEM [quantidade]` |

Substitua `!` pelo prefixo da instalação. A loja da Matilha aceita `premium`, `xp`, `protecao` e `titulos`; o RP aceita `comidas`, `bebidas`, `saude`, `presentes`, `moradias`, `veiculos` e `equipamentos`. Os comandos antigos sem filtro continuam funcionando. Navegue, por exemplo, com `!loja 2`, `!lojaalcateia 2` e `!rploja comidas 2`.

## Novidades da Matilha

IDs 1–6 preservam os produtos anteriores. IDs 7–16 acrescentam passes Premium de 1 e 30 dias, vigílias de XP de 2 e 6 horas, escudos de 1 e 12 horas e quatro títulos permanentes: Guardião da Floresta, Explorador Noturno, Sábio da Matilha e Lenda do Eclipse.

Títulos ficam em `!titulos` e podem ser trocados com `!titulo usar ID`. Uma nova compra equipa o título adquirido. Recomprar um título já possuído é recusado sem débito. Premium permanente concedido anteriormente é preservado. Compras acrescentam tempo aos efeitos compatíveis, até 90 dias para efeitos e 365 dias para Premium; uma compra que reduziria um bônus mais forte é recusada sem cobrar.

Os escudos da Matilha protegem o combate clássico `!atacar`; o HP de `!ataque` pertence à Alcateia. Os passes comprados com moeda virtual são benefícios do jogo e não alteram a licença de instalação.

## Recuperação e preparação da Alcateia

| ID | Item | Preço em WoK coin | Uso |
| --- | --- | --- | --- |
| 5 | Ervas da Floresta | 40 | Recupera até 25 HP da Alcateia |
| 6 | Elixir de Luar | 90 | Recupera até 60 HP |
| 7 | Fonte Lunar | 140 | Restaura até 100 HP |
| 8 | Garras do Eclipse | 220 | Ataque +30% por 2 horas |
| 9 | Manto da Sentinela | 220 | Defesa +30% por 2 horas |
| 10 | Olho da Coruja | 280 | Contra-ataque +40% por 2 horas |
| 11 | Ritual da Matilha | 420 | Ataque/defesa +20%, contra-ataque +30% por 90 minutos |
| 12 | Expedição de Treino | 500 | Três créditos de treino extra |

A recuperação é aplicada na compra e permite voltar de HP zero. Nenhum item supera 100 HP ou remove o cooldown de combate. O ritual preserva bônus superiores que já estejam ativos; percentuais do mesmo tipo não se somam. Créditos extras são gastos por `!treino` durante o cooldown normal.

## Ferramentas, trabalho e descanso no RP

Além de novas comidas, bebidas, remédios e presentes, o RP acrescenta chácara, refúgio lunar, jipe, motorhome e oito ferramentas profissionais:

| ID da ferramenta | Profissões compatíveis |
| --- | --- |
| `kitclinico` | Saúde |
| `maletajuridica` | Justiça e Política |
| `kitresgate` | Segurança |
| `kitensino` | Educação |
| `notebook` | Tecnologia |
| `kitoficina` | Serviços, Construção e Transporte |
| `kitcampo` | Rural |
| `instrumento` | Artes |

Compre em `!rpcomprar notebook` e equipe com `!usar notebook`. O equipamento permanece no inventário e aparece no perfil. Somente um fica ativo; quando compatível com a profissão, acrescenta 10% do salário-base, limitado a 20 WoK coin, e 2 XP por expediente. Trocar ou reequipar ferramentas não gera dinheiro ou XP. O trabalho mantém suas exigências e seu cooldown.

Uma moradia permite `!descansar`, recuperando energia e saúde RP conforme seu nível. O intervalo de 30 minutos persiste depois de reiniciar; com os atributos cheios, a tentativa não gasta a oportunidade. O descanso não cria moedas, não recupera saciedade e não elimina prisão RP. Veículos diminuem o gasto de energia no trabalho, com mínimo de 4 por expediente.

Use consumíveis com `!usar marmita` e presentes com `!usar pelucia @jogador`. A resposta informa a cena e os efeitos reais. Remédios de RP recuperam saúde RP; a recuperação de HP da Alcateia fica na loja da Alcateia. Consulte todos os pertences com `!inventario [página]`.

Compras e uso respeitam saldo, estoque, bans e limites de atributos. Os dados existentes permanecem no armazenamento normal e recebem apenas os campos novos necessários; a atualização não reinicia personagens, moedas, famílias ou proprietários.
