'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const eng=require('../app/src/main/assets/engine.js');
let p=85000;const candles=[];for(let i=0;i<241;i++){const wave=Math.sin(i*.17)*75+Math.sin(i*.029)*220;const change=Math.sin(i*.37)*32+(i%7===0?-35:9);const o=p;p=p+change*.7+wave*.035;const c=p;candles.push({t:1690000000000+i*900000,o,h:Math.max(o,c)+40+(i%13),l:Math.min(o,c)-25-(i%11),c,v:180+(i%10)*22});}
const ticker={lastPrice:String(candles.at(-1).c),fundingRate:'0.0001'};
const ob={b:Array.from({length:50},(_,i)=>[String(p-i*.5),'1.4']),a:Array.from({length:50},(_,i)=>[String(p+i*.5),'1.1'])};
const oi=[{timestamp:'1689990000000',openInterest:'100000'},{timestamp:'1690000000000',openInterest:'102000'}];
const a=eng.analyze(candles,ticker,ob,oi,{tickSize:0.1});
for(const side of ['long','short']){const x=a[side];for(const k of ['entry','stop','tp1','tp2','rr','risk','lossPct'])assert.ok(Number.isFinite(x[k]),side+' '+k);assert.ok(x.rr>=0);assert.ok(Math.abs(x.entry/0.1-Math.round(x.entry/0.1))<1e-6);}
assert.ok(a.long.stop<a.long.entry,'LONG 손절가');assert.ok(a.long.entry<a.long.tp1&&a.long.tp1<a.long.tp2,'LONG 익절');
assert.ok(a.short.stop>a.short.entry,'SHORT 손절가');assert.ok(a.short.entry>a.short.tp1&&a.short.tp1>a.short.tp2,'SHORT 익절');
assert.ok(a.indicators.rsi>=0&&a.indicators.rsi<=100,'RSI range');
const b=eng.analyze([...candles.slice(0,-1),{...candles.at(-1),c:1000000,h:1000001,v:300000}],ticker,ob,oi,{tickSize:0.1});
assert.equal(a.long.entry,b.long.entry,'미완성 마지막 봉을 참조하지 않음');
assert.equal(a.short.entry,b.short.entry,'미완성 마지막 봉을 참조하지 않음');
const noBook=eng.analyze(candles,ticker,null,oi);assert.equal(noBook.verdict,'WAIT','호가 없음은 보수적 WAIT');
assert.throws(()=>eng.analyze(candles.slice(0,50),ticker,ob,oi),/캔들 부족/);
console.log('PASS: independent indicators, TP/SL ordering, no-lookahead, missing data WAIT, risk formatting.');
