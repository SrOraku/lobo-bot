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
 // Conquistas expandidas — batalha e progressão
 ['sobrevivente','Sobrevivente','🩸','Vença uma batalha com 10 ou menos lobos vivos',s=>s.survivalWin,150],
 ['negociante','Negociante','🛒','Compre 10 itens na loja WoK',s=>s.purchases>=10,120],
 ['explorador','Explorador','🗺️','Complete 50 missões no bot',s=>s.missions>=50,200],
 ['intocavel','Intocável','🛡️','Use um escudo de batalha 5 vezes',s=>s.shieldsUsed>=5,100],
 ['milionario','Milionário','💎','Acumule 50.000 WoK coin de uma vez',s=>s.balance>=50000,500],
 ['centuriao','Centurião','🌟','Jogue o bot em 100 dias diferentes',s=>s.days>=100,300],
 ['alfaeterno','Alfa Eterno','🐺','Vença 200 batalhas ao longo da jornada',s=>s.wins>=200,500],
 ['semana_perfeita','Semana Perfeita','🔥','Mantenha 7 dias consecutivos de atividade',s=>s.streak>=7,200],
].map(([id,name,emoji,description,test,reward])=>({id,name,emoji,description,test,reward}));
