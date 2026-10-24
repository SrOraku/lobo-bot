'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function verifyStage(root,files,{publicKey=process.env.LOBO_RELEASE_PUBLIC_KEY}={}){
 let bytes;try{bytes=await fs.readFile(path.join(root,'manifest.json'));}catch(error){if(error.code==='ENOENT'){if(publicKey)throw Error('SIGNED_MANIFEST_REQUIRED');return {mode:'LEGACY_COMMIT_PINNING'};}throw error;}
 const manifest=JSON.parse(bytes);if(!manifest.files||typeof manifest.version!=='string'||Array.isArray(manifest.files))throw Error('INVALID_RELEASE_MANIFEST');
 for(const file of files){if(['manifest.json','manifest.sig'].includes(file.path))continue;if(!require('./source').managedPath(file.path)||!/^[a-f0-9]{64}$/.test(manifest.files[file.path]||''))throw Error('MANIFEST_FILE_MISSING');const hash=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file.path))).digest('hex');if(hash!==manifest.files[file.path])throw Error('RELEASE_HASH_MISMATCH');}
 const names=new Set(files.map(f=>f.path));if(Object.keys(manifest.files).some(name=>!names.has(name)))throw Error('MANIFEST_UNEXPECTED_FILE');
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));if(pkg.version!==manifest.version)throw Error('MANIFEST_VERSION_MISMATCH');
 if(publicKey){const trusted=publicKey?.type==='public'?publicKey:crypto.createPublicKey(publicKey);if(trusted.asymmetricKeyType!=='ed25519')throw Error('RELEASE_KEY_TYPE');const sig=await fs.readFile(path.join(root,'manifest.sig'),'utf8');if(!crypto.verify(null,bytes,trusted,Buffer.from(sig.trim(),'base64')))throw Error('RELEASE_SIGNATURE_INVALID');return {mode:'SIGNED_ED25519',version:manifest.version};}
 return {mode:'UNSIGNED_DEVELOPMENT_MODE',version:manifest.version};
}
module.exports={verifyStage};
