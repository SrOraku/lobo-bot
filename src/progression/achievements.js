'use strict';
module.exports=[
 ['aprendiz','Aprendiz Wolf','🐾','Use o bot em um dia',s=>s.days>=1,20],
 ['ativo','Jogador Ativo','🎮','Use o bot em 10 dias diferentes',s=>s.days>=10,100],
 ['sequencia','Sequência Perfeita','🔥','Mantenha 5 dias consecutivos',s=>s.streak>=5,100],
 ['guerreiro','Guerreiro Wolf','⚔️','Vença uma batalha',s=>s.wins>=1,30],
 ['cacador','Caçador','🏹','Vença 10 batalhas',s=>s.wins>=10,100],
 ['veterano','Veterano','🛡️','Vença 50 batalhas',s=>s.wins>=50,200],
 ['alfa','Alfa','🐺','Vença 100 batalhas',s=>s.wins>=100,300],
 ['mestre','Mestre','🌕','Conclua 25 minijogos',s=>s.played>=25,100],
 ['lenda','Lenda','🌟','Acumule 1000 pontos em minijogos',s=>s.points>=1000,200],
 ['magnata','Magnata','💰','Tenha 10000 WoK coin disponíveis',s=>s.balance>=10000,100],
 ['fundador','Fundador de Clã','👑','Lidere um clã da Alcateia',s=>s.founder,100],
 ['top1','Top 1','🏆','Lidere os minijogos com pelo menos 100 pontos',s=>s.top&&s.points>=100,100],
].map(([id,name,emoji,description,test,reward])=>({id,name,emoji,description,test,reward}));
