'use strict';
// Existing public character catalogue remains fully offline and persistent.
// A remote provider must implement this contract explicitly; no private endpoint is assumed.
function createAkinator({arcade}={}){return {play(ctx,prefix){return (arcade||require('../games/service').createArcade(require('../utils/database').db)).play(ctx.jid,ctx.sender,ctx.pushName||'Lobo','akinator',ctx.args.join(' '),ctx.msg.key.id,prefix);}};}
module.exports={createAkinator};
