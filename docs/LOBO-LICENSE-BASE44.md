# LOBO-BOT LICENSE — integração Base44

A integração é opcional e permanece desativada quando `LOBO_API_URL` e `LOBO_LICENSE_KEY` estão vazias.

## Configuração

No ambiente privado da instalação (arquivo `.env` ou secrets da hospedagem):

```env
LOBO_API_URL=https://lobo-license-hub.base44.app/functions/loboApi
LOBO_LICENSE_KEY=LOBO-CHAVE-GERADA-NO-PAINEL
```

Nunca coloque a credencial real no Git, em ZIP público, em mensagens ou em logs. Gere uma credencial no painel Base44 para o cliente correspondente. O bot gera um `installation_id` aleatório e o persiste em `data/lobo-license-installation.json`; mantenha esse arquivo junto dos dados da instalação ao reiniciar ou atualizar. Não copie a pasta `data` para outra máquina como se fosse uma nova instalação.

## Fluxo de inicialização

Antes de iniciar o supervisor/WhatsApp, o processo:
1. registra a instalação (`register_installation`);
2. valida a licença (`validate`);
3. autoriza o pareamento (`authorize_pairing`);
4. só então inicia o runtime do WhatsApp.

O heartbeat ocorre a cada 15 minutos. Uma negação explícita encerra o processo. Falhas de comunicação (timeout, rede ou HTTP 5xx) podem usar a tolerância de até 24 horas desde a última autorização bem-sucedida, registrada localmente em `data/lobo-license-state.json`. Respostas de credencial/chamada inválida e negações de licença não entram na tolerância.

## Ativação gradual

Sem as duas variáveis, o bot mantém o comportamento anterior. Configure primeiro uma instalação de teste, gere a credencial no painel e só depois habilite as variáveis no ambiente de hospedagem. A branch não contém credenciais reais e não ativa licenciamento em instalações existentes por padrão.

## Limites

- A tolerância local depende da integridade dos arquivos em `data/` e do relógio do servidor.
- O heartbeat encerra o processo quando recebe uma negação explícita ou quando a tolerância de comunicação termina.
- Esta alteração não cria clientes, planos ou credenciais no Base44 e não publica alterações no painel.
- Testes automatizados e validação contra uma credencial real ainda precisam ser executados antes de produção.
