# Mídia local — v1.0.0

Comandos: !sfundo [sticker|png|contorno|blur|cor], !tomp3, !qc, !efeito estourado/esquilo/grave/lento e !hidetag texto. !toimg mantém seus aliases e entrega PNG real, com a transparência da figurinha achatada sobre fundo branco.

O projeto já inclui sharp, fluent-ffmpeg e @ffmpeg-installer/ffmpeg. Instalação reproduzível: `npm ci`. O pacote IMG.LY também consta no package.json e no lockfile; npm ci instala todos.

A remoção de fundo usa `@imgly/background-removal-node@1.4.5` com o Sharp já utilizado no bot. O runtime ONNX de CPU está fixado em 1.16.3 para evitar o download de bibliotecas CUDA. A biblioteca valida sua configuração com `z.function().args()`, que só existe no zod 3; por isso o package.json instala o zod 3.25.76 **apenas dentro** de `@imgly/background-removal-node`, enquanto o restante do bot continua no zod 4. Sem esse ajuste a biblioteca nem carregava e o !sfundo falhava sempre. O `npm audit` aponta um aviso nesse zod 3; ele é a única exceção aceita pela auditoria do projeto (`npm run security`), fica visível em toda execução e está explicado no [SECURITY.md](../../SECURITY.md). A combinação foi verificada com inferência real em Node 22 e 24:

```sh
npm ci
```

Não precisa de Python, rembg ou chave de API. O modelo roda localmente em um processo separado e a memória é liberada ao terminar. O pacote e seus modelos aumentam o download da instalação; o host precisa de memória para a inferência. A biblioteca IMG.LY possui seus próprios termos de licença, incluídos no pacote.

## !sfundo — recorte de precisão

1. Envie uma foto e responda a ela com `!sfundo`. Também pode enviar a própria foto com a legenda `!sfundo`.
2. Sem opção, o bot envia **duas mensagens**: a figurinha transparente pronta e o PNG transparente como **documento** (`sem-fundo.png`), recortado no assunto com 4% de margem.

| Opção | O que envia |
| --- | --- |
| *(nenhuma)* | figurinha + PNG transparente em documento |
| `sticker`, `figurinha`, `fig`, `s` | só a figurinha |
| `png`, `arquivo`, `documento`, `doc`, `hd` | só o PNG em documento, em alta resolução |
| `contorno`, `borda`, `outline` | figurinha com contorno branco e sombra suave |
| `blur`, `desfocar`, `desfoque`, `retrato` | foto com o fundo original desfocado (modo retrato) |
| `branco`, `preto`, `vermelho`, `verde`, `azul`, `amarelo`, `rosa`, `roxo`, `laranja`, `cinza`, `#rgb`, `#rrggbb` | foto com o fundo trocado pela cor |

Maiúsculas e acentos são ignorados (`!sfundo DESFÓQUE` funciona). Uma opção desconhecida, ou mais de uma, mostra a mensagem de uso **antes** de baixar a foto, sem ocupar a fila de inferência.

### Por que o PNG vai como documento

O WhatsApp converte toda mensagem de *imagem* em JPEG e pinta a transparência de preto. Era por isso que o !sfundo antigo parecia "não remover o fundo": o recorte estava certo, mas chegava com fundo preto. Figurinhas (WebP com alpha) e documentos preservam a transparência byte a byte; por isso o recorte transparente sai nesses dois formatos. Os modos `blur` e de cor não têm transparência e vão como foto comum.

### Como o recorte funciona

1. A foto é girada conforme o EXIF do celular, convertida para sRGB e limitada a 1600 px.
2. O modelo de segmentação roda no worker. O padrão é `medium` (ISNet FP16), mais fiel em cabelo e bordas; `SFUNDO_MODEL=small` força o modelo pequeno. Valor inválido volta para `medium`, e se os arquivos do modelo escolhido estiverem incompletos o worker usa o outro.
3. A máscara passa pelo refinamento de `src/media/matting.js`, sem dependências e em tempo linear. As etapas pesadas rodam numa cópia com lado maior de ≈ 720 px e voltam por amostragem bilinear:
   - **filtro guiado colorido** (He, Sun & Tang) apenas na faixa incerta — onde a vizinhança mistura assunto e fundo, ou o alpha é parcial —, para a borda seguir as bordas reais da foto;
   - **limpeza**: manchas soltas pequenas e névoa desconectada do assunto somem; fios semitransparentes ligados ao assunto (cabelo, pelos) são mantidos; furos internos pequenos (até 0,15% da área do assunto) são fechados;
   - **descontaminação das bordas**: a cor local do fundo é estimada e retirada dos pixels semitransparentes, eliminando a franja verde/azul/branca que o fundo deixa no contorno.
4. O worker devolve só números (modelo, caixa do assunto, cobertura, largura e altura) numa linha `BACKGROUND_RESULT:{json}` — nunca caminhos nem saída nativa.
5. A figurinha é cortada no assunto, redimensionada com lanczos3 para caber em 512 px com margem (14 px; 24 px no modo contorno), centralizada num quadro 512 × 512 transparente e comprimida em degraus de qualidade até ficar com no máximo 100 KB.

Se o recorte ficar vazio (nenhum assunto em destaque), nada é enviado e aparece `BACKGROUND_EMPTY` com a orientação para usar uma foto em que o assunto apareça inteiro e separado do fundo.

`!s` sozinho continua sendo o conversor comum: preserva a transparência de imagens já recortadas, mas não remove o fundo de uma foto original.

## Pacote e autor das figurinhas

O WhatsApp lê o nome do pacote e o autor de um chunk EXIF dentro do próprio WebP. O Baileys ignora o campo `stickerMetadata` da mensagem — por isso, antes, o nome do pacote nunca aparecia. Agora `src/media/webp-exif.js` grava esse EXIF em **toda** figurinha (!s, !sfundo, vídeo e animadas). Nas animadas, só o EXIF e a flag do cabeçalho VP8X mudam; todos os quadros continuam idênticos.

Os textos vêm do `.env`:

```env
STICKER_PACK={bot}
STICKER_AUTHOR=Pedido por {nome}
```

| Marcador | Valor |
| --- | --- |
| `{nome}` | nome de quem pediu a figurinha |
| `{grupo}` | nome do grupo (só é consultado se for usado) |
| `{bot}` | `BOT_NAME` |
| `{dono}` | `DEVELOPER_NAME` |
| `{data}` | data de hoje (dd/mm/aaaa, horário de Brasília) |

`!s pacote | autor` personaliza os dois só naquela figurinha (os marcadores também valem ali). Caracteres de controle são removidos e cada texto é limitado a 128 caracteres. Se um WebP incomum não aceitar os metadados, a figurinha é enviada mesmo assim, sem pacote.

## Demais conversores

Os demais conversores exigem resposta à mídia. !qc cita até 500 caracteres; a foto pode estar oculta pela privacidade do autor, usando então avatar padrão. !hidetag exige grupo e administrador.

Limite de entrada 16 MB, vídeo/áudio convertido até 180 segundos, timeout FFmpeg 60 segundos e inferência local 180 segundos. Temporários exclusivos por operação são removidos no finally, inclusive em falhas. Nenhuma chave/API paga é usada na remoção. A qualidade do recorte depende da foto; não há promessa de segmentação perfeita para qualquer imagem (pôsteres e montagens, por exemplo, podem ter o "assunto" escolhido de forma inesperada).

Teste opcional de inferência real, sem WhatsApp: `npm run test:background`. Ele usa a imagem de teste do projeto e valida a figurinha, o PNG em documento, a transparência e a preservação do primeiro plano.

## Quando aparece “Mídia não concluída”

As dependências e os modelos são localizados pelo caminho do pacote instalado, independentemente da pasta em que o host iniciar o bot.

As falhas mostram um código e registram a etapa no console e no `logs/error.log`, sem URLs privadas, caminhos da sessão, chaves nem mensagens nativas completas:

- `MEDIA_DOWNLOAD_FAILED`: não foi possível obter a foto do WhatsApp; reenvie a foto.
- `MEDIA_INVALID_IMAGE`: o arquivo recebido não pôde ser aberto como imagem.
- `BACKGROUND_DEPENDENCY_MISSING` / `BACKGROUND_ASSET_MISSING`: instalação ou modelo incompleto; execute `npm ci` no projeto.
- `BACKGROUND_NATIVE_UNAVAILABLE`: biblioteca nativa incompatível com o Linux/processador ou processo nativo com falha. O ONNX distribuído para Linux requer glibc; imagens Alpine/musl precisam de uma imagem compatível.
- `BACKGROUND_MEMORY`: o motor informou falha de alocação de memória.
- `BACKGROUND_TERMINATED`: o sistema encerrou o worker por SIGKILL. Limites de recursos são uma possibilidade; esse sinal sozinho não comprova falta de RAM.
- `BACKGROUND_TIMEOUT`: o worker ultrapassou o prazo de três minutos e foi encerrado.
- `BACKGROUND_MODEL_FAILED` / `BACKGROUND_INFERENCE_FAILED`: falha ao carregar o modelo ou executar o recorte.
- `BACKGROUND_EMPTY`: o recorte não encontrou pessoa ou objeto em destaque; nada é enviado.
- `MEDIA_SEND_FAILED`: processamento terminou, mas o WhatsApp recusou o envio.

Memória: numa execução de referência (foto 1280 × 720, Node 22), o pico do worker foi de aproximadamente 1,1 GiB com `small` e 0,95 GiB com `medium` (FP16). O consumo varia com a máquina e a imagem; esses valores não são garantia nem exigência fixa. Planos pequenos podem encerrar o worker — nesse caso, teste `SFUNDO_MODEL=small`. Reduzir a foto não elimina a resolução interna de 1024 × 1024 do modelo.

A reação de falha é ❌; o handler retorna um resultado de falha para que a camada de reações não o substitua por ✅.
