'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function invalid(code,file){return Object.assign(new Error(code),{code,...(file?{updateFile:file}:{})});}
async function verifyStage(root,files,{publicKey=process.env.LOBO_RELEASE_PUBLIC_KEY}={}){
 let bytes;try{bytes=await fs.readFile(path.join(root,'manifest.json'));}catch(error){if(error.code==='ENOENT'){if(publicKey)throw invalid('SIGNED_MANIFEST_REQUIRED');return {mode:'LEGACY_COMMIT_PINNING'};}throw error;}
 let manifest;try{manifest=JSON.parse(bytes);}catch{throw invalid('INVALID_RELEASE_MANIFEST','manifest.json');}if(!manifest?.files||typeof manifest.version!=='string'||typeof manifest.files!=='object'||Array.isArray(manifest.files))throw invalid('INVALID_RELEASE_MANIFEST','manifest.json');
 for(const file of files){if(['manifest.json','manifest.sig'].includes(file.path))continue;if(!require('./source').managedPath(file.path)||!/^[a-f0-9]{64}$/.test(manifest.files[file.path]||''))throw invalid('MANIFEST_FILE_MISSING',file.path);const hash=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file.path))).digest('hex');if(hash!==manifest.files[file.path])throw invalid('RELEASE_HASH_MISMATCH',file.path);}
 const names=new Set(files.map(f=>f.path));if(Object.keys(manifest.files).some(name=>!names.has(name)))throw invalid('MANIFEST_UNEXPECTED_FILE','manifest.json');
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));if(pkg.version!==manifest.version)throw invalid('MANIFEST_VERSION_MISMATCH','manifest.json');
 if(publicKey){const trusted=publicKey?.type==='public'?publicKey:crypto.createPublicKey(publicKey);if(trusted.asymmetricKeyType!=='ed25519')throw invalid('RELEASE_KEY_TYPE');const sig=await fs.readFile(path.join(root,'manifest.sig'),'utf8');if(!crypto.verify(null,bytes,trusted,Buffer.from(sig.trim(),'base64')))throw invalid('RELEASE_SIGNATURE_INVALID','manifest.sig');return {mode:'SIGNED_ED25519',version:manifest.version};}
 return {mode:'UNSIGNED_DEVELOPMENT_MODE',version:manifest.version};
}
module.exports={verifyStage};
