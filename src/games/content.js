'use strict';
const WORDS = [
  ['alcateia', 'Coletivo de lobos'], ['territorio', 'Área defendida pela matilha'],
  ['uivo', 'Voz que atravessa a floresta'], ['lua', 'Satélite natural da Terra'],
  ['estrategia', 'Planejamento antes da batalha'], ['amizade', 'Vínculo entre companheiros'],
  ['floresta', 'Bioma com muitas árvores'], ['guardiao', 'Quem protege uma passagem'],
  ['tempestade', 'Vento, chuva e trovões'], ['coragem', 'Agir mesmo sentindo medo'],
  ['constelacao', 'Desenho formado por estrelas'], ['refugio', 'Lugar seguro para descansar'],
  ['inverno', 'Estação mais fria'], ['montanha', 'Grande elevação de terreno'],
  ['pegada', 'Rastro deixado no chão'], ['nascente', 'Onde um rio começa'],
];
const QUIZ = [
  ['Qual é o maior planeta do Sistema Solar?', ['Marte', 'Júpiter', 'Terra', 'Vênus'], 1, 'Júpiter é um gigante gasoso.'],
  ['Quantos lados tem um hexágono?', ['5', '7', '6', '8'], 2, 'Hexa significa seis.'],
  ['Qual órgão bombeia o sangue?', ['Pulmão', 'Fígado', 'Coração', 'Rim'], 2, 'O coração mantém a circulação.'],
  ['Qual é o coletivo de lobos?', ['Cardume', 'Alcateia', 'Enxame', 'Rebanho'], 1, 'Uma alcateia reúne lobos.'],
  ['Qual é a capital do Brasil?', ['Brasília', 'Salvador', 'Rio de Janeiro', 'São Paulo'], 0, 'Brasília é a capital desde 1960.'],
  ['Quanto é 12 × 8?', ['86', '98', '108', '96'], 3, '12 × 8 = 96.'],
  ['Qual gás as plantas absorvem na fotossíntese?', ['Hélio', 'Oxigênio', 'Dióxido de carbono', 'Hidrogênio'], 2, 'A fotossíntese utiliza CO₂, água e luz.'],
  ['Qual oceano é o maior?', ['Atlântico', 'Pacífico', 'Índico', 'Ártico'], 1, 'O Pacífico é o maior oceano da Terra.'],
  ['Qual é o satélite natural da Terra?', ['Sol', 'Marte', 'Lua', 'Titã'], 2, 'A Lua orbita a Terra.'],
  ['Quantos minutos há em duas horas?', ['120', '100', '90', '150'], 0, 'Cada hora possui 60 minutos.'],
  ['Qual destes animais é um mamífero?', ['Jacaré', 'Tubarão', 'Sapo', 'Baleia'], 3, 'Baleias respiram ar e amamentam.'],
  ['Qual linguagem é executada pelo Node.js?', ['Java', 'JavaScript', 'C', 'PHP'], 1, 'Node.js é um ambiente de execução JavaScript.'],
  ['Como se chama a água no estado sólido?', ['Vapor', 'Névoa', 'Gelo', 'Chuva'], 2, 'O congelamento transforma água em gelo.'],
  ['Qual é o resultado de 9²?', ['18', '81', '72', '99'], 1, '9² = 9 × 9.'],
  ['Qual instrumento mede a temperatura?', ['Bússola', 'Régua', 'Termômetro', 'Balança'], 2, 'Termômetros medem temperatura.'],
  ['Qual destes é um número primo?', ['9', '15', '21', '13'], 3, '13 só é divisível por 1 e por 13.'],
  ['O que uma bússola indica?', ['Temperatura', 'Direção', 'Velocidade', 'Peso'], 1, 'Uma bússola auxilia na orientação.'],
  ['Quantas patas possui uma aranha?', ['6', '8', '10', '4'], 1, 'Aranhas são aracnídeos e possuem oito patas.'],
  ['Qual é a unidade básica da vida?', ['Célula', 'Átomo', 'Planeta', 'Rocha'], 0, 'A célula é a unidade estrutural dos seres vivos.'],
  ['Qual cor resulta de azul e amarelo na mistura de tintas?', ['Roxo', 'Laranja', 'Verde', 'Rosa'], 2, 'A combinação forma verde.'],
];
const ROUTES = {
  inicio: ['A lua revelou três trilhas. Qual caminho seguir?', ['Floresta', 'Montanha', 'Rio'], ['floresta', 'montanha', 'rio']],
  floresta: ['Uma ponte antiga range sobre o abismo.', ['Reforçar com galhos', 'Correr sobre ela', 'Procurar outro caminho'], ['reforco', 'queda', 'ruinas']],
  montanha: ['Uma nevasca se aproxima do pico.', ['Buscar abrigo', 'Continuar subindo', 'Seguir as pegadas'], ['abrigo', 'frio', 'ruinas']],
  rio: ['Um filhote está preso em uma ilhota.', ['Construir uma passagem', 'Pular na correnteza', 'Pedir ajuda à matilha'], ['resgate', 'correnteza', 'alianca']],
  reforco: ['A ponte ficou firme. Um guardião pede uma prova de confiança.', ['Dividir provisões', 'Tentar enganá-lo', 'Oferecer ajuda'], ['vitoria', 'expulso', 'alianca']],
  ruinas: ['Nas ruínas há um mapa e uma porta selada.', ['Estudar o mapa', 'Forçar a porta', 'Voltar com segurança'], ['vitoria', 'armadilha', 'abrigo']],
  abrigo: ['A tempestade passou. A matilha aguarda sua decisão.', ['Guiar todos pelo vale', 'Subir sozinho', 'Organizar uma busca'], ['vitoria', 'frio', 'resgate']],
};
const ENDINGS = {
  vitoria: ['🏆 Guardião da Lua: você levou a matilha em segurança!', 50, true],
  alianca: ['🤝 Voz da Matilha: sua cooperação criou uma nova aliança!', 40, true],
  resgate: ['🐾 Protetor dos Filhotes: o resgate foi um sucesso!', 45, true],
  queda: ['🌫️ A ponte cedeu. Você voltou ao refúgio para se recuperar.', 5, false],
  frio: ['❄️ O frio obrigou você a recuar. Preparação também é estratégia.', 5, false],
  correnteza: ['🌊 A correnteza interrompeu a jornada. A matilha resgatou você.', 5, false],
  expulso: ['🚪 O guardião percebeu o engano e encerrou sua passagem.', 5, false],
  armadilha: ['🪤 A porta ativou uma armadilha. Você escapou sem o mapa.', 5, false],
};
module.exports = { WORDS, QUIZ, ROUTES, ENDINGS };
