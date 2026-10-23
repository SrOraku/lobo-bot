'use strict';
const dns=require('node:dns/promises');
const net=require('node:net');
const fs=require('node:fs');
const {pipeline}=require('node:stream/promises');
const {limiter}=require('../../commands/youtube-media');
const ORIGIN='https://api.bronxyshost.com.br';
const MAX_BYTES=32*1024*1024;
const blocked=new net.BlockList(),blocked6=new net.BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['::',96],['::ffff:0:0',96],['fc00::',7],['fe80::',10],['ff00::',8]])blocked6.addSubnet(address,prefix,'ipv6');
function publicAddress(address){const family=net.isIP(address);return !!family&&!(family===6?blocked6:blocked).check(address,family===6?'ipv6':'ipv4');}
async function publicURL(value,lookup=dns.lookup) {
  let url;try{url=new URL(value);}catch{throw Error('BRONXYS_URL');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw Error('BRONXYS_URL');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await lookup(host,{all:true});
  if(!addresses.length||addresses.some(item=>!publicAddress(item.address)))throw Error('BRONXYS_URL');
  return {url,addresses};
}
function createClient({getKey=require('./key').getKey,request=options=>require('axios').request(options),lookup=dns.lookup}={}) {
 function endpoint(name,params={}) {
   if(!/^[a-zA-Z0-9_-]+$/.test(name))throw Error('BRONXYS_ENDPOINT');
   const key=getKey();if(!key)throw Error('BRONXYS_KEY');
   const url=new URL('/api-bronxys/'+name,ORIGIN);
   for(const [field,value]of Object.entries(params))url.searchParams.set(field,String(value));
   url.searchParams.set('apikey',key);return url.href;
 }
 async function response(value,{signal,responseType='stream',data,method='GET',headers}={}) {
  let next=value;
  try {
   for(let redirects=0;redirects<5;redirects++) {
    const {url,addresses}=await publicURL(next,lookup);
    if(url.origin!==ORIGIN&&url.searchParams.get('apikey')===getKey())url.searchParams.delete('apikey');
    const address=addresses[0];
    const pinnedLookup=(_host,options,callback)=>typeof options==='function'?options(null,address.address,address.family):options?.all?callback(null,addresses):callback(null,address.address,address.family);
    const result=await request({url:url.href,method,data,headers,responseType,signal,timeout:90000,maxRedirects:0,maxContentLength:responseType==='json'?2*1024*1024:MAX_BYTES,maxBodyLength:8*1024*1024,validateStatus:()=>true,lookup:pinnedLookup});
    if(result.status>=300&&result.status<400&&result.headers.location){result.data?.destroy?.();next=new URL(result.headers.location,url).href;method='GET';data=undefined;continue;}
    if(result.status<200||result.status>=300){result.data?.destroy?.();throw Error([401,403].includes(result.status)?'BRONXYS_AUTH':result.status===429?'BRONXYS_QUOTA':'BRONXYS_SERVICE');}
    return result;
   }
   throw Error('BRONXYS_REDIRECT');
  } catch(error){if(/^BRONXYS_/.test(error.message))throw error;throw Error(signal?.aborted?'BRONXYS_TIMEOUT':'BRONXYS_SERVICE');}
 }
 async function json(name,params,options={}) {
  const result=await response(endpoint(name,params),{...options,responseType:'json'});
  if(!result.data||result.data.status===false||result.data.success===false||result.data.error)throw Error('BRONXYS_RESPONSE');
  return result.data.success===true&&Object.hasOwn(result.data,'data')?result.data.data:result.data;
 }
 async function download(url,destination,{signal}={}) {
  const result=await response(url,{signal});
  const mime=String(result.headers['content-type']||'').split(';')[0].toLowerCase();
  if(mime.includes('json')||mime.includes('text/')||Number(result.headers['content-length'])>MAX_BYTES){result.data.destroy();throw Error('BRONXYS_MEDIA');}
  await pipeline(result.data,limiter(MAX_BYTES),fs.createWriteStream(destination),{signal});
  if(!fs.statSync(destination).size)throw Error('BRONXYS_MEDIA');
  return mime;
 }
 async function upload(name,buffer,mime,options={}) {
  const FormData=require('form-data'),form=new FormData();
  form.append('file',buffer,{filename:mime.startsWith('image/')?'imagem.jpg':'audio.mp3',contentType:mime});
  const url=name==='transcrever'?new URL('/transcrever',ORIGIN):new URL('/api-bronxys/link_imagem',ORIGIN);
  const key=getKey();if(!key)throw Error('BRONXYS_KEY');url.searchParams.set('apikey',key);
  const result=await response(url.href,{...options,method:'POST',data:form,headers:form.getHeaders(),responseType:'json'});
  if(!result.data||result.data.error||result.data.success===false)throw Error('BRONXYS_RESPONSE');return result.data.success===true&&Object.hasOwn(result.data,'data')?result.data.data:result.data;
 }
 return {endpoint,json,download,upload,configured:()=>!!getKey()};
}
module.exports={createClient,publicURL,publicAddress,MAX_BYTES,ORIGIN};
