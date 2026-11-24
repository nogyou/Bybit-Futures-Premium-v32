const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/chart.js'),'utf8');
const ctx=vm.createContext({window:{},document:{getElementById:()=>null},TradeEngine:{},console});
vm.runInContext(code+';globalThis.__chart=TradeChart;',ctx);
const c=ctx.__chart;
const analysis={long:{entry:60000,stop:59700,risk:300,tp1:60380,tp2:60920},short:{entry:61000,stop:61300,risk:300,tp1:60700,tp2:60400}};
// setData triggers drawing; return early when document doesn't expose canvases.
c.setData([],analysis);
const a=Array.from(c.testLevels());
assert.equal(a.length,4);
for(const name of ['진입 구간','익절 구간']){
  assert.equal(a.filter(x=>x.name===name).length,2);
}
assert(a.find(x=>x.kind==='LONG'&&x.name==='익절 구간').lo===60380);
assert(a.find(x=>x.kind==='SHORT'&&x.name==='익절 구간').lo===60400);
assert(!a.some(x=>/TP1|TP2|SL/.test(x.name)));
assert(a.every(x=>x.hi>=x.lo));
console.log('PASS: both-direction entry/exit zones; no separate TP1/TP2/SL chart labels');
