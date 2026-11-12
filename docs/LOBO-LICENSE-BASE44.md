# LOBO-BOT LICENSE — integração Base44

Cada instalação do bot precisa de uma licença. O painel de licenças fica no Base44 (`lobo-license-hub`) e é a fonte de verdade: é lá que o vendedor cria a chave de cada cliente e suspende ou encerra uma licença.

## Configuração

No ambiente privado da instalação (arquivo `.env` ou variáveis do painel da hospedagem):

```env
LOBO_LICENSE_KEY=LOBO-CHAVE-GERADA-NO-PAINEL
```

`LOBO_API_URL` não precisa ser preenchida: o endereço do painel oficial já vem no bot. A variável só é aceita quando aponta para esse mesmo painel em HTTPS; qualquer outro servidor é recusado (`LOBO_LICENSE_URL_NOT_OFFICIAL`), para que uma instalação não troque o painel por um que sempre responda "autorizado".

Nunca coloque a chave real no Git, em ZIP público, em mensagens ou em logs. O bot gera um `installation_id` aleatório e o guarda em `data/lobo-license-installation.json`; mantenha esse arquivo junto dos dados da instalação ao reiniciar ou atualizar. Não copie a pasta `data` para outra máquina como se fosse uma nova instalação.

## Sem chave: 7 dias de aviso, depois bloqueio

A licença é obrigatória. Uma instalação que inicia sem `LOBO_LICENSE_KEY`:

1. entra em **período de aviso de 7 dias**, contados do primeiro início sem chave (guardado em `data/lobo-license-state.json`);
2. durante esse período funciona normalmente, mas avisa a cada início: no console (`[LICENÇA] Este bot está sem chave de licença…`) e por mensagem no WhatsApp do dono, com o prazo e o que fazer;
3. ao fim do prazo, **não inicia mais** (`LOBO_LICENSE_REQUIRED`). Se o prazo vencer com o bot ligado, ele é encerrado.

Reiniciar não renova o prazo. Colocar uma chave e tirar depois também não. O período de aviso existe para a transição de quem já usava o bot sem chave e **termina para todos em 10/12/2026**: a partir dessa data, uma instalação sem chave não inicia, mesmo que seja nova ou que os arquivos de `data/` tenham sido apagados. A data fica em `NOTICE_ENDS_AT`, em `src/licensing/licenseGuard.js`.

## Com chave: fluxo de inicialização

Antes de iniciar o supervisor e o WhatsApp, o processo:

1. registra a instalação (`register_installation`);
2. valida a licença (`validate`);
3. autoriza o pareamento (`authorize_pairing`);
4. só então inicia o runtime do WhatsApp.

Depois, a licença é conferida a cada 15 minutos (`heartbeat`).

- **Negação explícita** (chave inválida, licença suspensa ou encerrada no painel): o bot não inicia; se já estava ligado, é encerrado na verificação seguinte, em até 15 minutos. O motivo enviado pelo painel aparece no console, por exemplo `credencial_invalida`. Uma chave recusada não ganha período de aviso nem tolerância.
- **Painel fora do ar** (timeout, rede, HTTP 5xx, 408 ou 429): tolerância de até 24 horas desde a última autorização bem-sucedida. Quem nunca foi autorizado não tem tolerância.

O runtime (`src/runtime.js`) só roda sob o supervisor (`node src/index.js` ou `npm start`), que é quem confere a licença, e encerra junto quando o supervisor é parado. Iniciado diretamente, ele recusa.

## Mensagens no console

| Mensagem | Significado | O que fazer |
| --- | --- | --- |
| `Instalação autorizada pelo LOBO-BOT LICENSE.` | Licença válida. | Nada. |
| `Este bot está sem chave de licença…` | Período de aviso. | Colocar a chave em `LOBO_LICENSE_KEY` e reiniciar. |
| `LOBO_LICENSE_REQUIRED` | O aviso terminou e não há chave. | Colocar a chave e reiniciar. |
| `LOBO_LICENSE_DENIED` + motivo | O painel recusou a chave. | Conferir a chave e a situação da licença com o vendedor. |
| `LOBO_LICENSE_GRACE_EXPIRED` | Sem contato com o painel há mais de 24 h (ou nunca houve). | Verificar a internet da hospedagem. |
| `LOBO_LICENSE_URL_NOT_OFFICIAL` | `LOBO_API_URL` aponta para outro servidor. | Apagar a variável. |

## O que foi verificado

- Testes automáticos (`test/license-guard.test.js`, `test/license-hub-client.test.js`) cobrem o aviso de 7 dias, o bloqueio, as tentativas de renovar o prazo, a tolerância de 24 h, a verificação periódica e o encerramento do runtime junto com o supervisor, usando o `index.js` e o supervisor reais.
- Contra o painel real, foi verificado o caminho de **recusa**: uma chave não reconhecida recebe HTTP 401 com `{"ok":false,"authorized":false,"motivo":"credencial_invalida"}`, e o bot mostra esse motivo.
- O caminho de **sucesso** contra o painel real (chave válida até o `heartbeat`) ainda precisa ser confirmado com uma chave ativa antes de vender licenças.

## Limites

- O código do bot é entregue em JavaScript legível, e este repositório é público. A licença impede o uso casual sem chave e permite desligar instalações pelo painel, mas alguém com conhecimento técnico consegue remover a verificação do próprio código. Fechar isso exige distribuir o bot por um canal que só atenda quem tem licença (repositório privado e atualizações entregues pelo painel), o que ainda não existe.
- O painel precisa limitar quantas instalações cada chave pode registrar; o bot envia o `installation_id`, mas quem decide é o painel.
- A tolerância local e o período de aviso dependem dos arquivos em `data/` e do relógio do servidor.
- Se o painel ficar mais de 24 horas fora do ar, as instalações licenciadas param até ele voltar.
- Esta integração não cria clientes, planos ou chaves no Base44 e não altera o painel.
