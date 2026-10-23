# WoK coin — moeda universal (v1.6.0)

A economia original, o RP e a Alcateia passam a usar uma única carteira por pessoa em cada chat. O isolamento entre grupos e privado permanece. Pontos de jogos, XP e pontuação de clãs continuam sendo indicadores próprios: não são dinheiro disponível.

## Migração

- Migration SQLite 12 acrescenta carteiras, aliases verificados, estados de jogo e auditoria, sem apagar as tabelas anteriores.
- Antes de importar os saldos, a integração cria `storage/alcateia/before-universal.sqlite` pela API de backup SQLite e preserva o JSON anterior em `database.json.pre-universal` quando ele existe.
- Gold existente + WOK Coin existente = WoK coin, na proporção 1:1. Exemplo: 500 + 100 = 600. Cada chat recebe um marcador persistente; reiniciar não repete a soma.
- Famílias, inventários, clãs, cooldowns e progresso acompanham o estado completo do jogo importado. Tesouros familiares são preservados como tesouros, sem serem creditados novamente às carteiras. Pontuação de clãs não vira saldo.
- Valores negativos, fracionários ou acima do limite inteiro seguro interrompem a importação daquele chat. As fontes e o backup permanecem disponíveis.
- Chats novos seguem as sementes de isolamento já existentes. Um perfil RP/Alcateia novo usa a carteira existente, sem conceder outro bônus de registro.

## Fonte da verdade e compatibilidade

O Lobo Bot integrado persiste estado de jogo e movimentações em uma mesma transação SQLite. As colunas antigas `users.gold` continuam existindo por compatibilidade e são sincronizadas por triggers transacionais com a carteira universal. O JSON original não recebe novas operações: é uma fonte de migração preservada. Os backups do jogo consultam os estados e saldos atuais do SQLite.

PN e LID somente são associados a partir dos identificadores alternativos fornecidos pelo WhatsApp ou dos mapeamentos de identidade do Baileys. Nomes e texto da mensagem não comprovam identidade. Quando a relação não pode ser verificada, os registros permanecem separados até haver identificação confiável. Rankings monetários excluem aliases para não mostrar a mesma carteira duas vezes.

O addon standalone continua compatível com JSON. Depois da migração integrada, não use um bot antigo ou o addon standalone sobre o JSON antigo esperando ver as transações novas: elas estão no SQLite. Downgrade exige restauração planejada do conjunto de backup, com o bot parado; não copie somente o JSON.

## Comandos

- `!carteira`, `!wok`, `!wokcoin`, `!saldo` e `!gold`: mesma carteira.
- `!enviarwok @pessoa quantidade`, `!enviargold`, `!pay` e `!pagar`: transferência compatível.
- `!transferir`: mantém o fluxo RP e movimenta a mesma moeda.
- `!rankwok`, `!rankgold` e `!topgold`: ranking da carteira.
- `!daily`, lojas, profissões, batalhas, recompensas e doações usam WoK coin.

As permissões dos comandos permanecem. Sessões e `.env` não são alterados por essa migração. A moeda continua fictícia, sem conversão em dinheiro real.
