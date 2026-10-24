'use strict';
const FEATURES={PROMOTE:'antipromote',DEMOTE:'antidemote',REMOVE:'antimasskick',NAME_CHANGE:'lockname',DESCRIPTION_CHANGE:'lockdesc',PICTURE_CHANGE:'lockpic',SETTINGS_CHANGE:'antiroubo',EDIT:'antiedit'};
function evaluate({actor,target,action,flags,settings,mass=false,internal=false,botAdmin=false}){
 if(internal||actor?.isBot)return {allowed:true,action:'LOG',reason:'INTERNAL_ACTION'};
 const relevant=action==='REMOVE'?flags.antiroubo||mass:action==='PROMOTE'?flags.antipromote||mass:action==='DEMOTE'?flags.antidemote||flags.antiroubo&&target?.isBot:flags[FEATURES[action]]||mass;
 if(!relevant)return {allowed:true,action:'LOG',reason:'PROTECTION_DISABLED'};
 if(!actor?.known)return {allowed:false,action:'WARN',reason:'ACTOR_UNKNOWN'};
 const protectedDemotion=action==='DEMOTE'&&target?.protected&&target.level>=actor.level;
 if(actor.globalOwner||actor.level>=2&&!protectedDemotion){if(action==='DEMOTE'&&target?.isBot&&!botAdmin)return {allowed:true,action:'WARN',reason:'BOT_NOT_ADMIN'};if(mass)return {allowed:true,action:'WARN',reason:'TRUSTED_MASS_ACTIVITY'};return {allowed:true,action:'LOG',reason:'TRUSTED_ACTOR'};}
 if(action==='DEMOTE'&&target?.isBot&&!botAdmin)return {allowed:false,action:'WARN',reason:'BOT_NOT_ADMIN'};
 if(settings.mode==='baixa')return {allowed:false,action:'LOG',reason:'UNAUTHORIZED_'+action};
 if(action==='REMOVE'){const mode=settings.featureModes.antimasskick||(settings.mode==='media'?1:2);return {allowed:false,action:mass&&mode===3&&botAdmin&&actor.level===1?'DEMOTE_ACTOR':'WARN',reason:mass?'MASS_REMOVAL':'UNAUTHORIZED_REMOVAL'};}
 if(action==='DEMOTE'&&!target?.protected)return {allowed:false,action:'WARN',reason:'DEMOTION_RECORDED'};
 const feature=mass&&action==='PROMOTE'?'antimasspromote':FEATURES[action],mode=settings.featureModes[feature]||(settings.mode==='media'?1:2);
 if(mode===1)return {allowed:false,action:'WARN',reason:'UNAUTHORIZED_'+action};
 if(!botAdmin)return {allowed:false,action:'WARN',reason:'BOT_NOT_ADMIN'};
 if(action==='PROMOTE'&&target?.protected)return {allowed:false,action:'WARN',reason:'PROTECTED_TARGET'};
 return {allowed:false,action:'REVERT',reason:'UNAUTHORIZED_'+action,punish:mode===3&&actor.level===1&&!actor.creator};
}
module.exports={evaluate,FEATURES};
