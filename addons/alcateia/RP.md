> **Atualização v1.6.0:** no Lobo Bot integrado, Gold e WOK Coin foram unificados como **WoK coin**. Os saldos antigos são somados uma única vez, na proporção 1:1, por jogador e chat. Economia, RP e Alcateia usam a mesma carteira SQLite. Os comandos antigos continuam válidos; `!carteira`, `!saldo` e `!wok` consultam o saldo universal. Referências históricas abaixo à separação das moedas descrevem versões anteriores. O addon executado isoladamente continua usando seu armazenamento JSON.

# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

**Cidade RP: profissões, WOK Coin, lojas e família**

🌹 Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺

👑 Dono: +5543920030769

O RP é uma simulação por texto com personagens persistentes. Você escolhe uma profissão, trabalha, usa a função da carreira, cuida dos atributos, compra itens e forma uma família com consentimento dos participantes. Instalação e backups estão no [README](INTEGRACAO.md); o jogo da alcateia está em [JOGO.md](JOGO.md).

O catálogo inicial tem **64 profissões em 12 categorias** e pode ser ampliado. Cada carreira tem salário, experiência necessária e uma ação própria. As carreiras ilegais representam cenas fictícias sorteadas com efeitos no próprio personagem. Cargos de justiça, segurança e política usam regras do RP; eles não concedem poderes de administração de grupos nem autoridade sobre outras contas.

## Começar e consultar o personagem

Envie estes comandos, aguardando pelo menos 1 segundo entre eles:

```text
!rp iniciar
!rp perfil
!profissoes
!profissao entregador
!trabalhar
!carteira
```

`!rp iniciar` cria o personagem RP. Se o número ainda não tiver perfil, o primeiro registro recebe **100 WOK Coins** e os atributos iniciais da alcateia. Se você já usou `!start`, o RP reutiliza esse perfil e seu saldo. Repetir o início ou atualizar o bot preserva a carteira, sem conceder outro bônus.

**WOK Coin é uma moeda fictícia interna**, sem conversão em dinheiro real, depósitos bancários ou saques reais. Há uma carteira por número em cada chat, compartilhada entre RP e alcateia somente naquele chat. Grupos diferentes e privado mantêm saldos independentes. Por exemplo, gastar 20 WOK Coins em uma refeição RP reduz em 20 o saldo disponível na loja da alcateia. Os saldos da versão anterior são mantidos na proporção 1:1.

Os atributos RP começam em 100:

| Atributo RP | Uso |
| --- | --- |
| Saúde | Precisa estar acima de zero para trabalhar e exercer a profissão. Remédios e ações de saúde recuperam esse atributo. |
| Energia | Trabalhos e ações profissionais consomem energia; bebidas podem recuperar. |
| Saciedade | O valor 100 representa personagem alimentado. Trabalhar consome saciedade; alimentos recuperam. |
| Experiência — XP | Começa em zero e libera carreiras com requisitos maiores. |
| Reputação e procura | Começam em zero e refletem as ações do personagem. |

Saúde RP e **HP dos lobisomens são independentes**. Comer, beber ou usar remédio RP afeta somente os atributos RP. Os demais campos do perfil incluem profissão, prisão fictícia, família, cônjuge, moradia, veículo e carteira.

## Comandos do RP

| Comando | Função |
| --- | --- |
| `!rp iniciar` | Inicia o personagem preservando o saldo existente. |
| `!rp perfil` | Consulta os atributos do personagem. |
| `!rp menu` | Exibe o menu RP. `!rp` também abre o menu. |
| `!profissoes` | Lista as profissões, 10 por página. |
| `!profissoes 2` | Abre outra página do catálogo geral. |
| `!profissoes saude 1` | Filtra uma categoria e página. |
| `!profissao entregador` | Escolhe uma profissão por ID ou nome. |
| `!trabalhar` | Cumpre um expediente da profissão escolhida. |
| `!acao` | Exerce a ação própria da profissão. |
| `!acao @jogador` | Usa uma ação compatível com alvo, como atendimento de saúde ou aula de professor. |
| `!carteira` | Mostra o saldo compartilhado. |
| `!transferir @jogador 25` | Transfere uma quantidade inteira positiva para outro jogador. |
| `!rploja` ou `!rploja 2` | Abre uma página da loja RP. |
| `!rpcomprar refeicao 2` | Compra um item pela identificação e quantidade. A quantidade padrão é 1. |
| `!usar refeicao` | Consome uma unidade do item no próprio personagem. |
| `!inventario` | Mostra os itens RP disponíveis. |
| `!familia perfil` | Consulta a família. Veja os demais comandos na seção de família. |

Use uma menção real pelo seletor do WhatsApp quando houver alvo. Transferências exigem exatamente um destinatário registrado, saldo suficiente e quantidade inteira positiva. Elas não cobram taxa e não permitem transferir para si mesmo. As ações e convites destinados a personagens RP exigem que o alvo já tenha usado `!rp iniciar`.

## Profissões, trabalho e experiência

`!profissoes` mostra IDs e categorias. Escolha com `!profissao ID`, por exemplo `!profissao professor`. É necessário atingir o XP mínimo da carreira. Trocar de profissão preserva os tempos de espera do trabalho e da ação.

Um expediente pode ser feito a cada **1 hora por jogador**. Para trabalhar, tenha pelo menos **15 de energia**, **10 de saciedade**, saúde RP acima de zero e esteja fora da prisão fictícia. Um trabalho concluído consome 10 de energia e 10 de saciedade e acrescenta 10 XP. Nas carreiras legais, o pagamento é o salário fixo listado no catálogo.

`!acao` executa a função da profissão atual, cujo nome aparece no catálogo. Ela tem tempo de espera próprio de **5 minutos**, consome 10 de energia e concede 5 XP. Trocar de carreira não libera outra ação antecipadamente.

| Tipo de carreira | Efeito da ação |
| --- | --- |
| Saúde | Recupera até 20 de saúde RP do próprio personagem ou de outro personagem mencionado. Custa 20 WOK Coins a quem faz o atendimento. |
| Justiça | Reduz a própria procura em 1 e custa 40 WOK Coins. Exige procura acima de zero. |
| Policial e guarda | Patrulha simulada que rende 10 WOK Coins. |
| Professor | Concede 2 XP ao aluno mencionado; sem alvo, o próprio professor recebe esses 2 XP adicionais. |
| Demais carreiras legais | Acrescenta 1 de reputação. |
| Ilegal | Sorteia um resultado fictício, conforme a seção seguinte. |

Profissões que não aceitam alvo atuam somente no próprio personagem. Atendimento de saúde é recusado quando o personagem já está com saúde completa.

### Carreiras ilegais fictícias

No trabalho e na ação das carreiras da categoria Ilegal, há **25% de chance** de o personagem receber multa de até 20 WOK Coins, limitada ao saldo, e ficar em prisão fictícia por **10 minutos**. O resultado restante paga o salário no trabalho ou 20 WOK Coins na ação. A procura aumenta em 1 em ambos os resultados, até o limite de 100.

Durante a prisão, o personagem precisa aguardar o prazo para escolher profissão, trabalhar ou usar a ação profissional. As cenas usam sorteios e resultados de jogo, sem instruções práticas de crimes, acesso a contas ou retirada de saldo de outros jogadores.

### Política

Vereador, prefeito, deputado, governador, presidente e ministro são carreiras fictícias liberadas por experiência. Presidente exige 500 XP. O cargo altera a profissão do personagem, com salário e ação próprios; o sistema usa progressão por XP, sem eleição real ou poder sobre os participantes do grupo.

## Catálogo das 64 profissões

O valor de XP é o mínimo para escolher a carreira. O pagamento abaixo é por expediente concluído; cenas ilegais seguem o sorteio de multa e prisão descrito anteriormente. O nome da função identifica a ação narrativa executada por `!acao`.

| Categoria | ID | Profissão | XP mínimo | Salário em WOK Coin | Nome da função |
| --- | --- | --- | --- | --- | --- |
| Saúde | `medico` | Médico | 100 | 90 | tratar |
| Saúde | `enfermeiro` | Enfermeiro | 20 | 60 | cuidar |
| Saúde | `paramedico` | Paramédico | 40 | 65 | socorrer |
| Saúde | `dentista` | Dentista | 100 | 85 | consultar |
| Saúde | `psicologo` | Psicólogo | 80 | 75 | acolher |
| Saúde | `farmaceutico` | Farmacêutico | 60 | 70 | orientar |
| Saúde | `veterinario` | Veterinário | 80 | 80 | atender |
| Justiça | `advogado` | Advogado | 100 | 85 | recurso |
| Justiça | `juiz` | Juiz | 300 | 115 | julgar |
| Justiça | `promotor` | Promotor | 180 | 95 | parecer |
| Justiça | `defensor` | Defensor público | 80 | 80 | defender |
| Segurança | `policial` | Policial | 50 | 70 | patrulhar |
| Segurança | `guarda` | Guarda municipal | 20 | 55 | patrulhar |
| Segurança | `bombeiro` | Bombeiro | 50 | 70 | resgatar |
| Segurança | `detetive` | Detetive | 100 | 85 | investigar |
| Segurança | `seguranca` | Segurança privado | 0 | 45 | proteger |
| Educação | `professor` | Professor | 30 | 65 | ensinar |
| Educação | `diretor` | Diretor escolar | 150 | 90 | planejaraula |
| Educação | `pesquisador` | Pesquisador | 100 | 85 | pesquisar |
| Educação | `bibliotecario` | Bibliotecário | 0 | 45 | catalogar |
| Tecnologia | `programador` | Programador | 50 | 80 | programar |
| Tecnologia | `analista` | Analista de sistemas | 80 | 85 | analisar |
| Tecnologia | `suporte` | Técnico de suporte | 0 | 45 | diagnosticar |
| Tecnologia | `designer` | Designer | 30 | 65 | desenhar |
| Tecnologia | `cientistadedados` | Cientista de dados | 150 | 100 | modelar |
| Serviços | `cozinheiro` | Cozinheiro | 0 | 45 | cozinhar |
| Serviços | `padeiro` | Padeiro | 0 | 40 | assar |
| Serviços | `garcom` | Garçom | 0 | 30 | servir |
| Serviços | `barbeiro` | Barbeiro | 0 | 45 | cortar |
| Serviços | `mecanico` | Mecânico | 30 | 60 | reparar |
| Serviços | `eletricista` | Eletricista | 30 | 60 | instalar |
| Serviços | `encanador` | Encanador | 20 | 55 | consertar |
| Serviços | `vendedor` | Vendedor | 0 | 40 | negociar |
| Serviços | `contador` | Contador | 60 | 75 | auditar |
| Transporte | `motorista` | Motorista | 0 | 40 | transportar |
| Transporte | `taxista` | Taxista | 0 | 45 | corrida |
| Transporte | `piloto` | Piloto | 200 | 110 | voar |
| Transporte | `entregador` | Entregador | 0 | 25 | entregar |
| Transporte | `maquinista` | Maquinista | 50 | 70 | conduzir |
| Construção | `pedreiro` | Pedreiro | 0 | 45 | construir |
| Construção | `engenheiro` | Engenheiro | 150 | 100 | projetar |
| Construção | `arquiteto` | Arquiteto | 100 | 90 | planejarobra |
| Construção | `pintor` | Pintor | 0 | 40 | pintar |
| Rural | `agricultor` | Agricultor | 0 | 40 | colher |
| Rural | `pecuarista` | Pecuarista | 20 | 55 | cuidarrebanho |
| Rural | `pescador` | Pescador | 0 | 35 | pescar |
| Rural | `jardineiro` | Jardineiro | 0 | 35 | cultivar |
| Artes | `musico` | Músico | 20 | 55 | tocar |
| Artes | `ator` | Ator | 40 | 65 | atuar |
| Artes | `artesao` | Artesão | 0 | 40 | criar |
| Artes | `jornalista` | Jornalista | 40 | 65 | reportar |
| Artes | `fotografo` | Fotógrafo | 20 | 55 | fotografar |
| Política | `vereador` | Vereador | 200 | 85 | projeto |
| Política | `prefeito` | Prefeito | 300 | 100 | projeto |
| Política | `deputado` | Deputado | 350 | 105 | projeto |
| Política | `governador` | Governador | 400 | 115 | projeto |
| Política | `presidente` | Presidente | 500 | 120 | projeto |
| Política | `ministro` | Ministro | 350 | 110 | projeto |
| Ilegal | `mafioso` | Mafioso fictício | 100 | 95 | cena |
| Ilegal | `contrabandista` | Contrabandista fictício | 80 | 90 | cena |
| Ilegal | `ladrao` | Ladrão fictício | 0 | 65 | cena |
| Ilegal | `falsificador` | Falsificador fictício | 60 | 85 | cena |
| Ilegal | `apostador` | Apostador fictício | 0 | 60 | cena |
| Ilegal | `gangster` | Gângster fictício | 50 | 80 | cena |

## Loja RP e inventário

A loja RP tem catálogo próprio, acessado por `!rploja`; a loja da alcateia continua em `!loja`. Ambas descontam da mesma carteira WOK Coin. O catálogo RP é paginado em 10 itens por página.

Compras de itens de inventário aceitam de 1 a 100 unidades por comando e até 999 unidades acumuladas de cada tipo. Usar um item consome uma unidade. Atributos de saúde, energia e saciedade ficam no máximo em 100; quando nenhum efeito poderia aumentar um atributo, o uso é recusado sem consumir o item.

| ID | Item | Preço em WOK Coin | Efeito |
| --- | --- | --- | --- |
| `pao` | Pão | 5 | +10 saciedade |
| `refeicao` | Refeição | 20 | +35 saciedade |
| `banquete` | Banquete | 45 | +70 saciedade |
| `agua` | Água | 5 | +5 saciedade e +5 energia |
| `cafe` | Café | 10 | +20 energia |
| `energetico` | Energético | 25 | +45 energia |
| `remedio` | Remédio de RP | 30 | +25 saúde RP |
| `kitmedico` | Kit médico de RP | 70 | +60 saúde RP |
| `chocolate` | Chocolate | 15 | +20 saciedade |
| `flores` | Flores | 25 | Presente: +1 reputação ao destinatário RP |
| `presente` | Presente | 60 | Presente: +3 reputação ao destinatário RP |
| `alianca` | Aliança | 150 | Usada na aceitação de um pedido de casamento RP |
| `apartamento` | Apartamento | 1.500 | Moradia nível 1 |
| `casa` | Casa | 3.500 | Moradia nível 2 |
| `mansao` | Mansão | 10.000 | Moradia nível 3 |
| `bicicleta` | Bicicleta | 300 | Veículo nível 1 |
| `moto` | Moto | 1.500 | Veículo nível 2 |
| `carro` | Carro | 5.000 | Veículo nível 3 |
| `carroluxo` | Carro de luxo | 12.000 | Veículo nível 4 |

Alimentos, bebidas e remédios são usados no próprio personagem. A aliança fica reservada para o pedido de casamento e é consumida somente quando o destinatário aceita.

Moradias e veículos são registrados no perfil ao comprar, uma unidade por vez. Cada personagem mantém uma moradia e um veículo. Se já possuir um, a próxima compra dessa categoria precisa ser um nível superior e cobra o preço integral do novo bem. A aquisição substitui o registro anterior; o catálogo não oferece revenda. Esses bens registram a posse no RP.

## Família com consentimento

Cada personagem participa de apenas uma família RP. Criar uma família custa **200 WOK Coins**, descontadas de quem cria e passa a ser líder. O tesouro familiar começa em zero. Nomes têm de 2 a 32 caracteres, com letras, números, espaços, `_` e `-`, e são únicos ignorando maiúsculas e minúsculas.

| Comando | Uso |
| --- | --- |
| `!familia criar Lua Vermelha` | Cria a família. |
| `!familia convidar @jogador parente` | A liderança convida um personagem sem família. |
| `!familia convidar @jogador filho` | Envia convite com o papel fictício de filho. |
| `!familia convidar @jogador irmao` | Envia convite com o papel fictício de irmão. |
| `!familia casar @jogador` | A liderança propõe casamento e entrada na família. Exige aliança. |
| `!familia aceitar ID` | O destinatário aceita um convite ainda válido. |
| `!familia recusar ID` | O destinatário recusa o convite. |
| `!familia perfil` | Mostra liderança, membros, papéis e tesouro. |
| `!familia sair` | Sai da família e encerra eventual vínculo de casamento. |
| `!familia divorciar` | Encerra o vínculo e sai da família. |
| `!familia depositar 50` | Move saldo próprio para o tesouro da família. |
| `!familia retirar 50` | A liderança move saldo do tesouro para a própria carteira. |

O parentesco padrão do convite é `parente`; também são aceitos `filho` e `irmao`. Os papéis são vínculos fictícios entre personagens. O convite mostra um **ID** e expira em **10 minutos**. Somente o destinatário pode aceitar ou recusar, e sua família ou relacionamento permanecem inalterados até a aceitação. Convites conflitantes são recusados.

Para casar, a pessoa que propõe precisa liderar uma família e ter uma aliança de 150 WOK Coins no inventário. O destinatário precisa ter RP iniciado e estar sem família. Ambos devem estar sem cônjuge. O pedido não consome a aliança: ela é consumida ao aceitar, quando o vínculo é registrado nos dois personagens e o destinatário entra na família como cônjuge.

A saída é livre. Se a liderança sair e ainda houver membros, o membro restante mais antigo assume. Se sair a última pessoa, a família é encerrada e o tesouro restante volta à carteira dela. A saída ou o divórcio encerra o vínculo de casamento nos dois perfis e invalida os convites relacionados a quem saiu.

Qualquer membro pode depositar saldo próprio. Somente a liderança pode retirar, respeitando o saldo do tesouro. Esses movimentos transferem WOK Coins entre carteira e tesouro; o custo de criação da família não é depositado no tesouro. O clã da alcateia e a família RP são sistemas separados.

## Limites, dados e permissões

RP e alcateia compartilham o limite global de **1 comando por segundo** e **50 comandos em uma janela móvel de 1 hora por jogador**, inclusive para os donos. Os limites e tempos de espera são salvos e continuam após reiniciar o bot. As regras do grupo para bot pausado e comandos somente de administradores também se aplicam ao atendimento.

Os dois donos do jogo continuam sendo `5543996375955` e `5543920030769`. A permissão de dono dos comandos administrativos de grupo é configurada separadamente. Um banimento do jogo restringe o acesso ao RP e à alcateia, preservando os dados.

Perfis, carteira, inventários, profissões, famílias, convites e histórico RP ficam no mesmo banco indicado por `DATA_FILE`. Os backups automáticos de 6 horas e `!admin backup` incluem esses dados. Leia o [README](README.md#backups-e-restauração) antes de atualizar ou restaurar uma instalação.

🌹 Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
