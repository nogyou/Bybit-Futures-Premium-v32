'use strict';
/* Foreground signal-change detection; no exchange orders, background monitoring or prediction. */
const SignalAlerts = (() => {
  let activeKey = '', previous = 'WAIT';
  const lastEmitted = new Map();
  function observe(key, verdict, now=Date.now()) {
    const next = verdict==='LONG'||verdict==='SHORT' ? verdict : 'WAIT';
    if (key!==activeKey) { activeKey=key; previous='WAIT'; }
    const changed = previous!==next;
    const prior=previous; previous=next;
    if (!changed || next==='WAIT' || prior!=='WAIT') return {transition:false,verdict:next};
    const k=key+'|'+next;
    if (now-(lastEmitted.get(k)??-Infinity)<120000) return {transition:false,verdict:next,cooldown:true};
    lastEmitted.set(k,now);
    return {transition:true,verdict:next};
  }
  function reset(){activeKey='';previous='WAIT';lastEmitted.clear();}
  return {observe,reset};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SignalAlerts;
