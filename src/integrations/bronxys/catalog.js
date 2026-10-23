'use strict';
const definitions=[];
function add(name,category,description,endpoint,parameter,format,aliases=[]) {definitions.push({name,category,description,endpoint,parameter,format,aliases});}
for(const [name,endpoint,format]of [
 ['threads','threads','video'],['soundcloud','soundcloud','audio'],['ifunny','ifunny','video'],['kwai','kwai','video'],
 ['spotify','spotify','audio'],['tiktok_video','tiktok','video'],['tiktok_audio','tiktok','audio'],
 ['face_video','face_video','video'],['face_audio','face_audio','audio'],['twitter_video','twitter_video','video'],['twitter_audio','twitter_audio','audio'],
])add(name,'midia','Baixar '+name.replaceAll('_',' '),endpoint,'url',format,name==='threads'?['thr']:[]);
add('play','midia','Baixar música MP3','play','nome_url','audio');
add('play_video','midia','Baixar vídeo MP4','play_video','nome_url','video',['playmp4']);
add('playdoc','midia','Baixar música como documento MP3','play','nome_url','audio-document');
add('instagram','midia','Baixar post ou reel do Instagram','instagram','url','instagram');
add('insta_audio','midia','Extrair áudio do Instagram','instagram','url','instagram-audio');
add('mediafire','midia','Baixar arquivo do MediaFire','mediafire','url','mediafire');
add('aptoide','midia','Baixar APK do Aptoide','aptoide','url','aptoide');
add('tabelacamp','pesquisa','Tabela do Campeonato Brasileiro','tabela_camp',null,'json',['tabela_camp','tabela-camp','campeonato','camptabela']);
add('gruposwhatsapp','pesquisa','Catálogo público de grupos','gruposwhatsapp',null,'json');
add('grupos','pesquisa','Pesquisar grupos públicos','grupos','q','json');
add('aptoide_pesquisa','pesquisa','Pesquisar aplicativos no Aptoide','aptoide_pesquisa','pesquisa','json');
add('signo','util','Consultar horóscopo','horoscopo','signo','signo');
add('moedas','util','Consultar cotações de moedas','Moedas_Agora',null,'json',['cotacao']);
add('letra','pesquisa','Pesquisar letra de música','letra_musica','letra','json',['liryc','letram','letramusic','letramusica']);
add('pergunta','ia','Perguntar à IA da API Bronxys','PERGUNTE_E_EU_RESPONDO','q','json',['openai','gpt','chatgpt']);
add('esportenoticias','pesquisa','Notícias de esportes','esporte_noticias',null,'news',['esportenoticia','espnoticia','espnoticias','noticiasesporte','noticiaesporte','noticiaesp','noticiasesp','esporte_noticias','esporte_noticia','esporte-noticias','esporte-noticia']);
add('playstore','pesquisa','Pesquisar aplicativos na Play Store','playstore','nome','json');
add('celular','pesquisa','Informações de modelo de celular','info_celular','celular','json');
add('amazon','pesquisa','Pesquisar produtos na Amazon','Amazon_Pesquisa','pesquisa','json',['amazonsearch']);
add('pesquisa_yt','pesquisa','Pesquisar vídeos no YouTube','pesquisa_ytb','nome','json',['ytsearch']);
add('print','ferramentas','Capturar imagem de site público','print_de_site','url','image',['printdesite']);
add('gimage','pesquisa','Pesquisar imagem no Google','google-img','nome','google-image');
add('pinterest','pesquisa','Pesquisar imagem no Pinterest','pinterest','nome','pinterest');
add('cep','util','Consultar endereço por CEP','consultacep','cep','json');
add('metadinha','diversao','Enviar duas imagens combinadas','metadinha',null,'pair');
add('gerarnick','util','Criar variações de um apelido','gerar_nick','nick','json');
for(const [endpoint,names]of [
 ['logos_EPH','angelwing hackneon fpsmascote equipemascote txtquadrinhos ffavatar mascotegame angelglx gizquadro wingeffect blackpink metalgold girlmascote logogame'],
 ['logos_PHT','shadow cup txtborboleta cemiterio efeitoneon harryp lobometal neon2 madeira lovemsg3 coffecup coffecup2 florwooden narutologo fire romantic smoke papel lovemsg lovemsg2'],
 ['logos','ossos asfalto break glitch2 colaq neon3 nuvem horror matrix berry luxury lava thunderv2 neongreen neve neon neon1 neon3d gelo 3dgold lapis toxic demongreen rainbow halloween'],
])for(const name of names.split(' '))add(name,'ferramentas','Gerar arte de texto: '+name,endpoint,'texto','logo');
for(const name of ['attp','attp2','ttp_white','ttp_brat','attp_white','attp_brat','attp_white_video','attp_brat_video'])add(name,'figurinhas','Criar figurinha ou animação de texto',name.startsWith('attp')&&['attp','attp2'].includes(name)?'attp_edit':name.replace('_video',''),'texto',name.endsWith('_video')?'video':'sticker');
add('gerarlink2','ferramentas','Enviar imagem à API e obter link público','link_imagem',null,'upload',['imgpralink2']);
add('transcrever','ia','Transcrever áudio ou vídeo enviado à API','transcrever',null,'transcribe');
for(const name of 'lixo lgbt morto preso deletem procurado hitler borrar merda'.split(' '))add(name,'ferramentas','Aplicar montagem em imagem enviada à API','montagem',null,'montage');
module.exports={definitions};
