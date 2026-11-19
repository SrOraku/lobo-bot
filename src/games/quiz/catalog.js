'use strict';
const CATEGORIES = Object.freeze({ ciencia: 'Ciência', matematica: 'Matemática', tecnologia: 'Tecnologia', geografia: 'Geografia' });
const DIFFICULTIES = Object.freeze({ facil: { name: 'Fácil', points: 10 }, medio: { name: 'Médio', points: 15 }, dificil: { name: 'Difícil', points: 20 } });
const rows = {
 ciencia: {
  facil: [
   ['Qual órgão usamos principalmente para respirar?', ['Pulmões','Estômago','Fígado','Rins'],0,'Nos pulmões ocorre a troca de gases com o sangue.'],
   ['Qual estrela fornece luz para a Terra?', ['Sirius','Sol','Polaris','Vega'],1,'O Sol é a estrela do nosso sistema planetário.'],
   ['Como se chama a passagem de água líquida para vapor?', ['Fusão','Condensação','Evaporação','Solidificação'],2,'Evaporação é uma forma de vaporização.'],
   ['Qual destes animais põe ovos?', ['Gato','Cachorro','Golfinho','Galinha'],3,'Galinhas são aves ovíparas.'],
   ['Qual sentido percebe os sons?', ['Audição','Olfato','Paladar','Tato'],0,'A audição transforma vibrações em sinais percebidos pelo cérebro.'],
  ],
  medio: [
   ['Qual organela produz a maior parte do ATP na respiração aeróbica?', ['Ribossomo','Mitocôndria','Lisossomo','Núcleo'],1,'A fosforilação oxidativa ocorre na membrana interna mitocondrial.'],
   ['Qual partícula possui carga elétrica negativa?', ['Próton','Nêutron','Elétron','Fóton'],2,'Elétrons possuem carga negativa.'],
   ['Qual unidade do SI mede força?', ['Joule','Watt','Pascal','Newton'],3,'Um newton é um quilograma metro por segundo ao quadrado.'],
   ['Qual gás é o mais abundante no ar seco da Terra?', ['Nitrogênio','Oxigênio','Argônio','Dióxido de carbono'],0,'O nitrogênio representa cerca de 78% do ar seco.'],
   ['Qual cientista formulou as leis do movimento clássicas?', ['Darwin','Newton','Mendel','Pasteur'],1,'Newton publicou três leis do movimento nos Principia.'],
  ],
  dificil: [
   ['Qual grandeza permanece constante numa colisão isolada, inclusive inelástica?', ['Energia cinética','Velocidade de cada corpo','Quantidade de movimento total','Temperatura'],2,'Sem força externa resultante, conserva-se o momento linear total.'],
   ['Qual base nitrogenada aparece no RNA em lugar da timina?', ['Adenina','Citosina','Guanina','Uracila'],3,'O RNA normalmente usa uracila.'],
   ['Qual processo reduz o número de cromossomos pela metade?', ['Meiose','Mitose','Tradução','Replicação'],0,'A meiose forma células haploides a partir de células diploides.'],
   ['Qual é a unidade SI de quantidade de matéria?', ['Grama','Mol','Litro','Kelvin'],1,'O mol corresponde a um número definido de entidades elementares.'],
   ['O que mede o número atômico de um elemento?', ['Nêutrons','Prótons e nêutrons','Prótons','Elétrons de valência'],2,'O número de prótons identifica o elemento químico.'],
  ],
 },
 matematica: {
  facil: [
   ['Quanto é 7 × 6?', ['36','48','49','42'],3,'Sete grupos de seis somam 42.'],
   ['Qual fração equivale a metade?', ['1/2','1/3','2/3','1/4'],0,'Uma metade é uma de duas partes iguais.'],
   ['Quantos centímetros há em um metro?', ['10','100','1.000','60'],1,'O prefixo centi representa um centésimo.'],
   ['Quanto é 25 + 37?', ['52','72','62','63'],2,'25 + 30 + 7 = 62.'],
   ['Qual figura tem três lados?', ['Quadrado','Pentágono','Hexágono','Triângulo'],3,'Triângulos têm três lados e três ângulos.'],
  ],
  medio: [
   ['Qual é a área de um retângulo de lados 8 e 5?', ['40','26','13','80'],0,'A área é base vezes altura: 8 × 5.'],
   ['Qual é 15% de 200?', ['15','30','20','45'],1,'0,15 × 200 = 30.'],
   ['Se 3x + 4 = 19, quanto vale x?', ['3','4','5','6'],2,'Subtraindo 4 e dividindo por 3, x = 5.'],
   ['Qual é a média de 4, 8 e 12?', ['6','10','12','8'],3,'A soma 24 dividida por três é 8.'],
   ['Qual é a raiz quadrada positiva de 144?', ['12','14','16','24'],0,'12 × 12 = 144.'],
  ],
  dificil: [
   ['Qual é a derivada de x³ em relação a x?', ['x²','3x²','3x','x³/3'],1,'Pela regra da potência, d(xⁿ)/dx = n xⁿ⁻¹.'],
   ['Qual é log₂(32)?', ['4','6','5','8'],2,'2 elevado a 5 é 32.'],
   ['Qual é a probabilidade de duas caras em dois lançamentos de moeda justa?', ['1/2','3/4','1/8','1/4'],3,'Os eventos são independentes: 1/2 × 1/2 = 1/4.'],
   ['Qual é o determinante da matriz [[2,1],[3,4]]?', ['5','8','11','2'],0,'2 × 4 − 1 × 3 = 5.'],
   ['Uma progressão geométrica começa em 3 e tem razão 2. Qual é o quinto termo?', ['24','48','96','32'],1,'O quinto termo é 3 × 2⁴ = 48.'],
  ],
 },
 tecnologia: {
  facil: [
   ['Qual dispositivo é usado para apontar na tela?', ['Microfone','Impressora','Mouse','Caixa de som'],2,'O mouse é um dispositivo de entrada apontador.'],
   ['O que um navegador permite acessar?', ['Somente planilhas','Somente fotos locais','Somente o teclado','Páginas da web'],3,'Navegadores interpretam conteúdos da web.'],
   ['Qual destes é um sistema operacional?', ['Linux','HDMI','USB','JPEG'],0,'Linux é usado como núcleo de diversos sistemas operacionais.'],
   ['Para que serve uma senha?', ['Aumentar a tela','Auxiliar na autenticação','Carregar a bateria','Melhorar o áudio'],1,'Uma senha é um fator de autenticação e deve permanecer privada.'],
   ['Qual formato costuma armazenar imagens?', ['MP3','WAV','PNG','TXT'],2,'PNG é um formato de imagem com compressão sem perdas.'],
  ],
  medio: [
   ['O que significa a sigla CPU?', ['Canal Público Universal','Central de Páginas Únicas','Controle de Pacotes USB','Unidade Central de Processamento'],3,'CPU executa instruções de programas.'],
   ['Qual protocolo é a versão protegida por TLS do HTTP?', ['HTTPS','FTP','SMTP','DNS'],0,'HTTPS utiliza TLS para proteger a comunicação HTTP.'],
   ['Qual estrutura impede chaves duplicadas em uma tabela?', ['Comentário','Restrição UNIQUE','Ordenação DESC','Alias de coluna'],1,'Uma restrição UNIQUE exige unicidade dos valores definidos.'],
   ['Qual tipo de memória é normalmente volátil?', ['SSD','Disco óptico','RAM','ROM'],2,'A RAM normalmente perde seu conteúdo sem alimentação.'],
   ['O que um backup permite fazer?', ['Substituir uma senha','Evitar qualquer ataque','Eliminar testes','Recuperar dados de uma cópia'],3,'Backups são cópias para recuperação, que também precisam ser testadas.'],
  ],
  dificil: [
   ['Qual propriedade de transação exige aplicar tudo ou nada?', ['Atomicidade','Latência','Indexação','Compressão'],0,'Atomicidade evita uma operação parcialmente aplicada.'],
   ['O que uma condição de corrida envolve?', ['Somente cálculos lentos','Resultado dependente da ordem de acessos concorrentes','Uma senha longa','Um arquivo grande'],1,'Acessos concorrentes não coordenados podem gerar resultados incorretos.'],
   ['O que um hash criptográfico não oferece sozinho?', ['Resumo de tamanho fixo','Detecção de alteração quando comparado a valor confiável','Confidencialidade do conteúdo','Função determinística'],2,'Hash não é criptografia para esconder o conteúdo.'],
   ['Por que validar redirects em um baixador?', ['Para mudar o título','Para aumentar o tamanho','Para desabilitar HTTPS','Para impedir destino privado inesperado'],3,'Um endereço inicialmente público pode redirecionar a redes internas.'],
   ['O que torna uma operação idempotente?', ['Repetir produz o mesmo efeito de uma execução','Ela usa inteligência artificial','Ela sempre demora menos','Ela exige dois bancos'],0,'Idempotência evita efeitos duplicados no reprocessamento.'],
  ],
 },
 geografia: {
  facil: [
   ['Em qual continente está o Brasil?', ['Europa','América do Sul','Ásia','África'],1,'O Brasil ocupa grande parte da América do Sul.'],
   ['Qual é a capital da Argentina?', ['Lima','Santiago','Buenos Aires','Montevidéu'],2,'Buenos Aires é a capital argentina.'],
   ['Qual oceano banha o litoral brasileiro?', ['Pacífico','Índico','Ártico','Atlântico'],3,'O litoral brasileiro está voltado ao Atlântico.'],
   ['Qual linha divide a Terra em hemisférios norte e sul?', ['Equador','Trópico de Capricórnio','Greenwich','Círculo Polar Ártico'],0,'A linha do Equador corresponde à latitude zero.'],
   ['Qual país tem Tóquio como capital?', ['China','Japão','Coreia do Sul','Tailândia'],1,'Tóquio é a capital do Japão.'],
  ],
  medio: [
   ['Qual é o maior país em área territorial?', ['Canadá','China','Rússia','Estados Unidos'],2,'A Rússia é o país de maior extensão territorial.'],
   ['Qual cordilheira acompanha a porção oeste da América do Sul?', ['Alpes','Himalaia','Atlas','Andes'],3,'Os Andes se estendem ao longo do oeste sul-americano.'],
   ['Qual bioma brasileiro apresenta vegetação de savana?', ['Cerrado','Pampa','Pantanal','Mata Atlântica'],0,'O Cerrado é um bioma de savana tropical.'],
   ['Qual estreito separa Europa e África entre Espanha e Marrocos?', ['Bering','Gibraltar','Magalhães','Malaca'],1,'Gibraltar conecta o Atlântico ao Mediterrâneo.'],
   ['Qual é a capital do Canadá?', ['Toronto','Vancouver','Ottawa','Montreal'],2,'Ottawa é a capital federal canadense.'],
  ],
  dificil: [
   ['Qual projeção preserva ângulos localmente, mas amplia áreas perto dos polos?', ['Azimutal equidistante','Peters','Mollweide','Mercator'],3,'Mercator é conforme e distorce áreas em altas latitudes.'],
   ['Qual fenômeno envolve aquecimento anormal do Pacífico equatorial central e leste?', ['El Niño','La Niña','Monção','Aurora'],0,'El Niño modifica a circulação atmosférica e padrões de chuva.'],
   ['Qual processo converte rochas em sedimentos por desagregação e alteração?', ['Subducção','Intemperismo','Cristalização','Metamorfismo'],1,'Intemperismo pode ser físico, químico ou biológico.'],
   ['Qual limite entre placas é associado à separação e formação de crosta oceânica?', ['Convergente','Transformante','Divergente','Passivo continental'],2,'Dorsais oceânicas estão em limites divergentes.'],
   ['Qual coordenada expressa distância angular a leste ou oeste de Greenwich?', ['Altitude','Latitude','Azimute','Longitude'],3,'Longitude usa o meridiano de Greenwich como referência.'],
  ],
 },
};
const QUESTIONS = Object.freeze(Object.entries(rows).flatMap(([category, levels]) => Object.entries(levels).flatMap(([difficulty, entries]) => entries.map((entry, index) => Object.freeze({ id: `${category}-${difficulty}-${index + 1}`, category, difficulty, text: entry[0], choices: Object.freeze(entry[1]), answer: entry[2], explanation: entry[3] })))));
const byId = new Map(QUESTIONS.map(question => [question.id, question]));
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function category(value) { const key = normalize(value); if (!CATEGORIES[key]) throw Error('Categoria inválida. Consulte quiz categorias.'); return key; }
function difficulty(value = 'medio') { const key = normalize(value); if (!DIFFICULTIES[key]) throw Error('Dificuldade inválida: facil, medio ou dificil.'); return key; }
function deck(cat, level, pick = require('node:crypto').randomInt) {
 const selected = QUESTIONS.filter(question => question.category === category(cat) && question.difficulty === difficulty(level)).map(question => question.id);
 for (let i = selected.length - 1; i > 0; i--) { const n = pick(i + 1); if (!Number.isInteger(n) || n < 0 || n > i) throw Error('Sorteio de perguntas inválido.'); [selected[i], selected[n]] = [selected[n], selected[i]]; }
 return selected.slice(0, 5);
}
module.exports = { CATEGORIES, DIFFICULTIES, QUESTIONS, byId, normalize, category, difficulty, deck };
