# Mídia local — v1.0.0

Novos comandos: !sfundo [sticker], !tomp3, !qc, !efeito estourado/esquilo/grave/lento e !hidetag texto. !toimg mantém seus aliases e agora entrega PNG real.

O projeto já inclui sharp, fluent-ffmpeg e @ffmpeg-installer/ffmpeg. Instalação reproduzível: `npm ci`. O pacote IMG.LY agora também consta no package.json e no lockfile; npm ci instala todos.

A remoção de fundo usa `@imgly/background-removal-node@1.4.5` com o Sharp já utilizado no bot. Ela é instalada junto das dependências do projeto. O runtime ONNX de CPU está fixado em 1.16.3 para evitar o download de bibliotecas CUDA, e usa o Sharp existente; a combinação foi verificada com inferência real em Node 22 e 24:

```sh
npm ci
```

Não precisa de Python, rembg ou chave de API. O modelo pequeno é carregado localmente em um processo separado e a memória é liberada ao terminar. O pacote e seus modelos aumentam o download da instalação; o host precisa de memória para a inferência. A qualidade da máscara depende da imagem. A biblioteca IMG.LY possui seus próprios termos de licença, incluídos no pacote.

Imagem com legenda !sfundo ou resposta a imagem é aceita. !sfundo sticker produz WebP transparente. Os demais conversores exigem resposta à mídia. !qc cita até 500 caracteres; a foto pode estar oculta pela privacidade do autor, usando então avatar padrão. !hidetag exige grupo e administrador.

Limite de entrada 16 MB, vídeo/áudio convertido até 180 segundos, timeout FFmpeg 60 segundos e inferência local 180 segundos. Temporários exclusivos por operação são removidos no finally, inclusive em falhas. Nenhuma chave/API paga é usada na remoção. A qualidade da máscara depende do modelo; não há promessa de segmentação perfeita para qualquer foto.

Teste opcional de inferência real, sem WhatsApp: `npm run test:background`. Ele usa a imagem de teste do projeto e valida PNG, transparência e preservação do primeiro plano.
