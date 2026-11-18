'use strict';
// Protege o canal entre o `node --test` e cada arquivo de teste.
//
// O executor lê o stdout de cada processo de teste como um canal binário: molduras do
// serializador V8 (bytes FF 0F, tamanho de 4 bytes e a mensagem). Texto impresso no
// mesmo stdout chega misturado com essas molduras. No Node 22 o tamanho é lido com
// `byte << 24`, que tem sinal: se um texto cai logo depois de uma moldura, no mesmo
// pedaço lido do pipe, e o 3º byte dele é ≥ 0x80 (emoji ou acento, como
// "  🌹 Migration v1 aplicada"), o tamanho vira negativo e o executor tenta ler lixo:
// "Unable to deserialize cloned data due to invalid or unsupported version".
// Depende de como o pipe junta os pedaços, por isso aparece só às vezes no CI.
//
// Nos processos de teste, só as molduras do executor ficam no stdout. Todo o resto vai
// para o stderr, que o executor mostra do mesmo jeito. Carregado com
// `node --test --require ./test/support/stdout-guard.js` (o executor repassa o
// --require a cada processo de teste); no processo principal não faz nada.
const V8_VERSION_TAG = 0xff;
const GUARDED = Symbol.for('lobo.stdoutGuard');

const isFrame = chunk => chunk instanceof Uint8Array && chunk.length > 0 && chunk[0] === V8_VERSION_TAG;

function install({ stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  if (env.NODE_TEST_CONTEXT !== 'child-v8' || stdout[GUARDED]) return false;
  const original = stdout.write;
  stdout.write = function write(chunk, encoding, callback) {
    if (isFrame(chunk)) return original.call(this, chunk, encoding, callback);
    return stderr.write(chunk, encoding, callback);
  };
  Object.defineProperty(stdout, GUARDED, { value: true });
  return true;
}

install();

module.exports = { install, isFrame };
