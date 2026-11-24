'use strict';
const assert=require('node:assert/strict');
const E=require('../app/src/main/assets/engine.js');
const profiles={scalp:['5','15','60'],short:['30','60','240'],long:['D','240','W']};
for(const [mode,tfs] of Object.entries(profiles)){
  const spec=E.strategyConfig(mode);
  assert.equal(spec.anchor,tfs[0]);
  assert.deepEqual(spec.higher,tfs.slice(1));
  assert(spec.hold.length>2);
}
// Synthetic TEST-ONLY candles, never real-market signals.
function synthetic(amp){let p=61000;const a=[];
  for(let i=0;i<260;i++){
    const o=p;p+=Math.sin(i*.12)*amp + Math.cos(i*.37)*amp*.25+amp*.02;
    a.push({t:1700000000000+i*300000,o,h:Math.max(o,p)+amp*.65,l:Math.min(o,p)-amp*.63,c:p,v:120+(i%15)*15});
  }
  return a;
}
const bars5=synthetic(12),bars30=synthetic(45),barsD=synthetic(220);
const frames={};for(const [tf,c] of [['1',bars5],['3',bars5],['5',bars5],['15',bars5],['30',bars30],['60',bars30],['240',barsD],['D',barsD],['W',barsD]])frames[tf]=E.summarizeFrame(c,tf);
const current={lastPrice:'61250',fundingRate:'0.0001'};
const args=(strategyMode)=>({tickSize:.1,frames,strategyMode});
const m5=E.analyze(bars5,current,null,null,args('scalp'));
const m30=E.analyze(bars30,current,null,null,args('short'));
const mD=E.analyze(barsD,current,null,null,args('long'));
assert.equal(m5.strategy.anchor,'5');assert.equal(m30.strategy.anchor,'30');assert.equal(mD.strategy.anchor,'D');
assert.equal(m5.verdict,'WAIT');assert.equal(m30.verdict,'WAIT');assert.equal(mD.verdict,'WAIT'); // no orderbook => no firm signal
const snapshots=[m5,m30,mD].map(x=>[x.long.entry,x.short.entry,x.indicators.atr]);
assert(new Set(snapshots.map(x=>x.join('|'))).size>1,'distinct horizon candle structures produce distinct plans');
const noW={...frames};delete noW.W;
const missing=E.analyze(barsD,current,null,null,{...args('long'),frames:noW});
assert(missing.long.failed.some(x=>x.includes('상위 시간봉')||x.includes('해당 투자 기간')),'missing context reduces certainty');
console.log('PASS v3.2.5: independent short/medium/long horizons, distinct planning inputs, missing book WAIT and higher-timeframe gating');
