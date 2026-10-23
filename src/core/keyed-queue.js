'use strict';
class KeyedQueue {
  constructor({maxKeys=1000,maxPending=50}={}) {this.entries=new Map();this.maxKeys=maxKeys;this.maxPending=maxPending;}
  run(key,task) {
    let state=this.entries.get(key);
    if(!state && this.entries.size>=this.maxKeys) return Promise.reject(Error('Fila ocupada. Tente novamente.'));
    if(!state) {state={tail:Promise.resolve(),count:0};this.entries.set(key,state);}
    if(state.count>=this.maxPending) return Promise.reject(Error('Muitos comandos pendentes neste chat.'));
    state.count++;
    const next=state.tail.then(task);
    state.tail=next.catch(()=>{});
    return next.finally(()=>{state.count--;if(!state.count && this.entries.get(key)===state)this.entries.delete(key);});
  }
}
module.exports={KeyedQueue};
