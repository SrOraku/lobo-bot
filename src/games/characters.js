'use strict';
const QUESTIONS = [
  ['real', 'Seu personagem existe ou existiu na vida real?'],
  ['sport', 'Seu personagem é conhecido pelo esporte?'],
  ['music', 'Seu personagem é conhecido pela música?'],
  ['anime', 'Seu personagem aparece em anime?'],
  ['hero', 'Seu personagem é um super-herói de quadrinhos?'],
  ['brazil', 'Seu personagem é brasileiro?'],
  ['science', 'Seu personagem é conhecido pela ciência?'],
  ['magic', 'Seu personagem usa magia?'],
  ['pirate', 'Seu personagem é um pirata?'],
  ['saiyan', 'Seu personagem é um saiyajin?'],
  ['cape', 'Seu personagem usa capa?'],
  ['guitar', 'Seu personagem é conhecido por tocar guitarra?'],
  ['argentina', 'Seu personagem é argentino?'],
  ['portugal', 'Seu personagem é português?'],
  ['ninja', 'Seu personagem é um ninja?'],
  ['orange', 'Seu personagem é conhecido por usar laranja?'],
  ['business', 'Seu personagem é conhecido por empresas de tecnologia?'],
  ['rap', 'Seu personagem é conhecido pelo rap?'],
  ['queen', 'Seu personagem foi vocalista da banda Queen?'],
  ['prince', 'Seu personagem é um príncipe?'],
  ['dark', 'Seu personagem é conhecido como Cavaleiro das Trevas?'],
];
const CHARACTERS = [
  ['Naruto Uzumaki', ['anime', 'ninja', 'orange']], ['Sasuke Uchiha', ['anime', 'ninja']],
  ['Goku', ['anime', 'saiyan', 'orange']], ['Vegeta', ['anime', 'saiyan', 'prince']],
  ['Luffy', ['anime', 'pirate']], ['Harry Potter', ['magic']],
  ['Batman', ['hero', 'cape', 'dark']], ['Superman', ['hero', 'cape']],
  ['Spider-Man', ['hero']], ['Albert Einstein', ['real', 'science']],
  ['Neymar', ['real', 'sport', 'brazil']], ['Lionel Messi', ['real', 'sport', 'argentina']],
  ['Cristiano Ronaldo', ['real', 'sport', 'portugal']], ['Michael Jackson', ['real', 'music']],
  ['Bob Marley', ['real', 'music', 'guitar']],
  ['Elon Musk', ['real', 'business']], ['Eminem', ['real', 'music', 'rap']],
  ['Freddie Mercury', ['real', 'music', 'queen']],
];
// Append-only traits and candidates keep indexes in saved sessions compatible.
QUESTIONS.push(
  ['female','Seu personagem é uma mulher?'],['game','Seu personagem nasceu em jogos eletrônicos?'],
  ['animal','Seu personagem é um animal ou criatura não humana?'],['robot','Seu personagem é um robô?'],
  ['pokemon','Seu personagem pertence ao universo Pokémon?'],['yellow','A aparência do seu personagem é predominantemente amarela?'],
  ['blue','A aparência do seu personagem é predominantemente azul?'],['plumber','Seu personagem é conhecido como encanador?'],
  ['princess','Seu personagem é uma princesa?'],['zelda','Seu personagem pertence à série The Legend of Zelda?'],
  ['ice','Seu personagem controla gelo?'],['detective','Seu personagem trabalha como detetive?'],
  ['starwars','Seu personagem pertence ao universo Star Wars?'],['droid','Seu personagem é um droide astromecânico?'],
  ['sith','Seu personagem é associado aos Sith?'],['jedi','Seu personagem é um mestre Jedi?'],
  ['sea','Seu personagem vive no fundo do mar?'],['sponge','Seu personagem é uma esponja?'],
  ['ogre','Seu personagem é um ogro?'],['mouse','Seu personagem é um rato?'],
  ['archer','Seu personagem é conhecido por usar arco e flecha?'],['warriorprincess','Seu personagem é uma guerreira amazona?'],
  ['armor','Seu personagem usa uma armadura tecnológica?'],['shield','Seu personagem é conhecido por seu escudo circular?'],
  ['hammer','Seu personagem é conhecido por usar um martelo mágico?'],['green','Seu personagem é conhecido pela pele verde?'],
  ['doctor','Seu personagem é conhecido como médico?'],['titan','Seu personagem pode se transformar em titã?'],
  ['demonhunter','Seu personagem caça demônios?'],['strawhats','Seu personagem integra os Piratas do Chapéu de Palha?'],
  ['swords','Seu personagem luta usando três espadas?'],['navigator','Seu personagem é uma navegadora?'],
  ['witchschool','Seu personagem estudou em Hogwarts?'],['bookish','Seu personagem é conhecido por estudar muito em Hogwarts?'],
  ['curie','Seu personagem recebeu Nobel em duas áreas científicas?'],['computing','Seu personagem é pioneiro da computação?'],
  ['basketball','Seu personagem é conhecido pelo basquete?'],['tennis','Seu personagem é conhecido pelo tênis?'],
  ['french','Seu personagem é francês?'],['footballqueen','Seu personagem é conhecida como a Rainha do Futebol?'],
  ['singlatin','Seu personagem é uma cantora colombiana?'],['britishsinger','Seu personagem é uma cantora britânica?'],
  ['volleyball','Seu personagem é conhecido pelo vôlei?'],['saturn','Seu personagem é conhecido por pesquisas sobre Saturno?'],
);
CHARACTERS.push(
  ['Pikachu',['game','animal','pokemon','yellow']],['Sonic',['game','animal','blue']],
  ['Mario',['game','plumber']],['Princesa Peach',['game','female','princess']],
  ['Link',['game','zelda']],['Zelda',['game','zelda','female','princess']],
  ['Elsa',['female','princess','magic','ice']],['Sherlock Holmes',['detective']],
  ['R2-D2',['starwars','robot','droid']],['Darth Vader',['starwars','sith','cape']],
  ['Yoda',['starwars','jedi','green']],['Bob Esponja',['animal','yellow','sea','sponge']],
  ['Patrick Estrela',['animal','sea']],['Shrek',['animal','green','ogre']],
  ['Mickey Mouse',['animal','mouse']],['Katniss Everdeen',['female','archer']],
  ['Mulher-Maravilha',['female','hero','warriorprincess']],['Homem de Ferro',['hero','armor','business']],
  ['Capitão América',['hero','shield']],['Thor',['hero','hammer','magic']],
  ['Hulk',['hero','green','science']],['Doutor Estranho',['hero','doctor','magic']],
  ['Eren Yeager',['anime','titan']],['Tanjiro Kamado',['anime','demonhunter']],
  ['Roronoa Zoro',['anime','pirate','strawhats','swords']],['Nami',['anime','pirate','strawhats','female','navigator']],
  ['Hermione Granger',['female','magic','witchschool','bookish']],['Ron Weasley',['magic','witchschool']],
  ['Marie Curie',['real','female','science','curie']],['Alan Turing',['real','science','computing']],
  ['Michael Jordan',['real','sport','basketball']],['Serena Williams',['real','sport','female','tennis']],
  ['Kylian Mbappé',['real','sport','french']],['Marta',['real','sport','female','brazil','footballqueen']],
  ['Shakira',['real','female','music','singlatin']],['Adele',['real','female','music','britishsinger']],
  ['Giba',['real','sport','brazil','volleyball']],['Carolyn Porco',['real','female','science','saturn']],
);
function nextQuestion(state) {
  let best=-1,imbalance=Infinity;
  QUESTIONS.forEach(([key],i)=>{
    if(state.asked.includes(i))return;
    const yes=state.candidates.filter(n=>CHARACTERS[n]?.[1].includes(key)).length;
    if(!yes||yes===state.candidates.length)return;
    const difference=Math.abs(state.candidates.length-2*yes);
    if(difference<imbalance){imbalance=difference;best=i;}
  });
  return best;
}
module.exports = { QUESTIONS, CHARACTERS, nextQuestion };
