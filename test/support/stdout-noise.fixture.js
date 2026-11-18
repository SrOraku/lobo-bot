'use strict';
// Arquivo de teste de mentira usado por test/test-runner-stdout.test.js: imprime o mesmo
// tipo de texto que o bot imprime durante os testes (emoji no começo, acentos).
const { test } = require('node:test');

for (let i = 1; i <= 40; i++) {
  test(`ruído ${i}`, () => {
    console.log(`  🌹 Migration v${i} "teste" aplicada`);
    process.stdout.write('🌹 Verificando banco de dados...\n');
    console.info('ação concluída');
    process.stdout.write(Buffer.from('não é moldura\n'));
  });
}
