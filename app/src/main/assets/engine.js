/* Bybit Premium v3.2 — 공개시장 데이터 기반 정량 전략 계산 (학습된 예측 AI 아님).
 * 전제: 캔들 오름차순, 마지막 캔들은 미완성 봉이므로 의사결정에서 제외.
 * 신호 확정 전 데이터/거래량/위험보상/가격대/시장수급 확인. 주문 실행 불가.
 */
'use strict';
const TradeEngine = (() => {
  const num = v => { const x=Number(v);return Number.isFinite(x)?x:NaN; };
  const avg = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : NaN;
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const finite = (...a)=>a.every(Number.isFinite);
  function ema(values,period) {
    const out=Array(values.length).fill(null);if(values.length<period)return out;
    let v=avg(values.slice(0,period));out[period-1]=v;const k=2/(period+1);
    for(let i=period;i<values.length;i++){v=values[i]*k+v*(1-k);out[i]=v;}return out;
  }
  function rsi(values,period=14){
    const a=Array(values.length).fill(null);if(values.length<=period)return a;
    let g=0,l=0;for(let i=1;i<=period;i++){const d=values[i]-values[i-1];g+=Math.max(0,d);l+=Math.max(0,-d);}g/=period;l/=period;
    a[period]=l===0?(g===0?50:100):100-100/(1+g/l);
    for(let i=period+1;i<values.length;i++){let d=values[i]-values[i-1];g=(g*(period-1)+Math.max(0,d))/period;l=(l*(period-1)+Math.max(0,-d))/period;a[i]=l===0?(g===0?50:100):100-100/(1+g/l);}return a;
  }
  function atr(c,period=14){const a=Array(c.length).fill(null);if(c.length<=period)return a;const tr=[];for(let i=1;i<c.length;i++){tr.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));}
    let v=avg(tr.slice(0,period));a[period]=v;for(let i=period+1;i<c.length;i++){v=(v*(period-1)+tr[i-1])/period;a[i]=v;}return a;}
  function macd(close){const fast=ema(close,12),slow=ema(close,26),line=close.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]-slow[i]);
    const sig=Array(close.length).fill(null),hist=Array(close.length).fill(null);const valid=line.slice(25);if(valid.length>=9){let s=avg(valid.slice(0,9));sig[33]=s;hist[33]=line[33]-s;for(let i=34;i<line.length;i++){s=line[i]*.2+s*.8;sig[i]=s;hist[i]=line[i]-s;}}return {line,sig,hist};}
  function pivots(c,n=100){const lo=[],hi=[];for(let i=Math.max(3,c.length-n);i<c.length-3;i++){const x=c[i];if(x.l<=c[i-1].l&&x.l<=c[i-2].l&&x.l<c[i+1].l&&x.l<c[i+2].l)lo.push(x.l);
      if(x.h>=c[i-1].h&&x.h>=c[i-2].h&&x.h>c[i+1].h&&x.h>c[i+2].h)hi.push(x.h);}return {lo,hi};}
  function chooseZone(closed,price,a,kind){const ps=pivots(closed);const low=Math.min(...closed.slice(-50).map(c=>c.l));const high=Math.max(...closed.slice(-50).map(c=>c.h));const lo100=Math.min(...closed.slice(-96).map(c=>c.l));const hi100=Math.max(...closed.slice(-96).map(c=>c.h));const rg=hi100-lo100;
    const fib=[.236,.382,.5,.618,.786].map(x=>lo100+rg*x);
    const candidates=kind==='LONG'?[...ps.lo,low,...fib]:[...ps.hi,high,...fib];
    const minAway=Math.max(a*.45,price*.001);const maxAway=Math.max(a*5.5,price*.045);
    const v=candidates.filter(x=>kind==='LONG'?x<=price-minAway&&x>=price-maxAway:x>=price+minAway&&x<=price+maxAway);
    const fallback=kind==='LONG'?price-a*1.25:price+a*1.25;
    if(!v.length)return {level:fallback,origin:'ATR 추정 구간'};
    // 가장 근접한 국지 피벗/피보나치 합류 가격대 우선.
    const sorted=v.map(x=>({x,score:v.filter(y=>Math.abs(x-y)<=a*.33).length*2-Math.abs(x-price)/(a*2)})).sort((a,b)=>b.score-a.score);
    return {level:sorted[0].x,origin:'피벗·피보나치 지지저항'};
  }
  function weightedSignals(ctx){const {e20,e50,e200,e20prev,r,macdHist,macdPrev,vr,imbalance,oidelta,funding}=ctx;
    const calc=side=>{const l=side==='LONG';let score=0,max=0;const detail=[];
      function add(name,weight,value,description){max+=weight;if(value===null){detail.push({name,value:'데이터 없음',side:'neutral',points:0,max:weight});return;}const pass=!!value;score+=pass?weight:0;detail.push({name,value:description,side:pass?'good':'bad',points:pass?weight:0,max:weight});}
      add('EMA 배열',18,l?e20>e50:e20<e50,`EMA20 ${e20>e50?'상승':'하락'} 배열`);
      add('EMA 기울기',12,l?e20>e20prev:e20<e20prev,`EMA20 ${e20>e20prev?'상향':'하향'} 전환`);
      add('장기 방향',8,e200===null?null:(l?e50>e200:e50<e200),`EMA50 / EMA200 위치`);
      add('RSI(14)',12,l?(r>=28&&r<=60):(r>=40&&r<=74),`RSI ${r.toFixed(1)} · ${l?'상승 여력':'하락 여력'} 평가`);
      add('MACD 변화',16,l?(macdHist>macdPrev):(macdHist<macdPrev),`히스토그램 ${macdHist>=0?'+':''}${macdHist.toFixed(3)}`);
      add('거래량',10,vr>=1.10,`완성봉 평균 대비 ${vr.toFixed(2)}배`);
      add('호가 불균형',14,imbalance===null?null:(l?imbalance>=.54:imbalance<=.46),imbalance===null?'호가 조회 불가':`매수호가 ${Math.round(imbalance*100)}%`);
      add('OI 변화',5,oidelta===null?null:(l?oidelta>0:oidelta>0),oidelta===null?'OI 조회 불가':`미결제약정 ${oidelta>=0?'+':''}${oidelta.toFixed(2)}%`);
      add('펀딩비',5,funding===null?null:(l?funding<.0007:funding>-.0007),funding===null?'펀딩비 조회 불가':`펀딩 ${(funding*100).toFixed(4)}%`);
      return {score,max,percentage:Math.round(score/max*100),detail};};
    return {long:calc('LONG'),short:calc('SHORT')};
  }
  // 상위 시간봉 요약: 실제 닫힌 캔들만 사용, 방향은 예측 확률이 아님.
  function summarizeFrame(candles,tf) {
    if(!Array.isArray(candles)||candles.length<61)return null;
    const closed=candles.slice(0,-1);const n=closed.length;const prices=closed.map(x=>Number(x.c));
    const e20=ema(prices,20).at(-1),e50=ema(prices,50).at(-1),r=rsi(prices).at(-1),a=atr(closed).at(-1),mac=macd(prices).hist;
    if(!finite(e20,e50,r,a,mac.at(-1),mac.at(-2)))return null;
    const slope=ema(prices,20).at(-1)-ema(prices,20).at(-5);
    const rising=e20>e50&&slope>0&&mac.at(-1)>=mac.at(-2),falling=e20<e50&&slope<0&&mac.at(-1)<=mac.at(-2);
    const last=closed.at(-1).c;const ps=pivots(closed,125);
    const lows=closed.slice(-52).map(x=>x.l),highs=closed.slice(-52).map(x=>x.h);
    const low=Math.min(...lows),high=Math.max(...highs),range=high-low;
    return {tf,trend:rising?'LONG':falling?'SHORT':'WAIT',rsi:r,atr:a,volatility:a/last*100,
      ema20:e20,ema50:e50,price:last,support:low,resistance:high,
      levels:[...ps.hi,...ps.lo,low,high,...[.236,.382,.5,.618,.786].map(k=>low+range*k)]};
  }
  function evaluateDurations(frameSummaries){
    const frames=frameSummaries||{};
    const specs=[{key:'scalp',title:'초단기',tfs:['1','3','5','15'],hold:'수분~1시간'},{key:'day',title:'당일',tfs:['5','15','30','60'],hold:'수시간~당일'},{key:'swing',title:'스윙',tfs:['60','240','D'],hold:'1일~수일'}];
    const plans=specs.map(spec=>{
      let up=0,down=0,used=0;
      for(const tf of spec.tfs){const f=frames[tf];if(!f)continue;used++;if(f.trend==='LONG')up++;if(f.trend==='SHORT')down++;}
      const gap=Math.abs(up-down),covered=used>=2;
      const side=!covered||gap===0?'WAIT':up>down?'LONG':'SHORT';
      return {...spec,side,covered,agreed:gap,used,reason:!covered?'시간봉 데이터 부족':gap===0?'시간봉 방향 상충':`${used}개 중 ${side==='LONG'?up:down}개 시간봉이 ${side==='LONG'?'상승':'하락'} 우세`};
    });
    const eligible=plans.filter(x=>x.covered&&x.side!=='WAIT').sort((a,b)=>(b.agreed/Math.max(b.used,1))-(a.agreed/Math.max(a.used,1)));
    return {plans,preferred:eligible[0]?.key||null,notes:'보유 기간은 확정 예측이 아닌 분석 구간 분류'};
  }
  function structuralTargets(closed,entry,stop,side,atrValue,multi={}) {
    const long=side==='LONG',dir=long?1:-1,risk=Math.abs(entry-stop);
    const ps=pivots(closed,155),v=[...ps.lo,...ps.hi];
    for(const w of [24,48,96,150]){
      const span=closed.slice(-w);if(span.length<8)continue;
      const low=Math.min(...span.map(c=>c.l)),high=Math.max(...span.map(c=>c.h));
      v.push(low,high);
      for(const r of [.236,.382,.5,.618,.786])v.push(low+(high-low)*r);
    }
    for(const f of Object.values(multi||{})){if(f&&Array.isArray(f.levels))v.push(...f.levels);}
    const minGap=Math.max(atrValue*.18,entry*.00015);
    const filtered=v.filter(x=>Number.isFinite(x)&&x>0&&(x-entry)*dir>minGap).sort((a,b)=>dir*(a-b));
    const dedup=[];for(const x of filtered){if(!dedup.length||Math.abs(x-dedup.at(-1))>Math.max(atrValue*.32,entry*.00022))dedup.push(x);}
    // 멀리 있는 목표가를 이론적 R 배수에 맞춰 발명하지 않고 실제 구조 가격만 사용.
    return {tp1:dedup[0]??NaN,tp2:dedup[1]??NaN,zoneCount:dedup.length,source:'가격 피벗·매물 반응 구간·피보나치·상위봉'};
  }
  function leverageScenario(plan,side,config={}) {
    const leverage=Math.max(1,Math.min(100,Number(config.leverage)||1)),margin=Math.max(0,Number(config.margin)||0);
    const fee=Math.max(0,Number(config.feeSide)||0),slip=Math.max(0,Number(config.slipSide)||0),funding=Math.abs(Number(config.funding)||0);
    const notional=leverage*margin,entry=plan?.entry,dir=side==='LONG'?1:-1;
    const pnl=target=>Number.isFinite(target)&&Number.isFinite(entry)&&entry>0?(target-entry)*dir/entry*notional-notional*(2*(fee+slip)+funding):null;
    const riskPct=plan&&entry>0?Math.abs(plan.stop-entry)/entry*100:null;
    const requiredAdverse=100/leverage; // 청산가가 아님; 유지증거금/계정잔고 제외 전 명목 손실폭
    const tooRisky=riskPct!==null&&riskPct>=requiredAdverse*.60;
    return {leverage,margin,notional,mode:config.mode||'isolated',tp1Pnl:pnl(plan?.tp1),tp2Pnl:pnl(plan?.tp2),slPnl:pnl(plan?.stop),tp1Roi:pnl(plan?.tp1)===null?null:pnl(plan?.tp1)/Math.max(margin,1)*100,tp2Roi:pnl(plan?.tp2)===null?null:pnl(plan?.tp2)/Math.max(margin,1)*100,slRoi:pnl(plan?.stop)===null?null:pnl(plan?.stop)/Math.max(margin,1)*100,riskPct,initialMarginMovement:requiredAdverse,tooRisky,liquidationPrice:null};
  }
  function analyze(candles,ticker,orderbook,oi,options={}){
    if(!Array.isArray(candles)||candles.length<130)throw new Error('분석에 필요한 캔들 부족 (최소 130개)');
    const closed=candles.slice(0,-1);const close=closed.map(c=>num(c.c));const n=close.length;
    const last=closed[n-1],prev=closed[n-2];const livePrice=num(ticker.lastPrice);
    if(!finite(livePrice)||livePrice<=0||closed.some(c=>!finite(c.o,c.h,c.l,c.c,c.v)))throw new Error('가격 데이터 오류');
    const e20a=ema(close,20),e50a=ema(close,50),e200a=ema(close,200),rsia=rsi(close),atra=atr(closed),m=macd(close);
    const e20=e20a[n-1],e50=e50a[n-1],e200=e200a[n-1],r=rsia[n-1],a=atra[n-1],macdHist=m.hist[n-1],macdPrev=m.hist[n-2];
    if(!finite(e20,e50,r,a,macdHist,macdPrev)||a<=0)throw new Error('지표 계산 불가');
    const avgv=avg(closed.slice(-21,-1).map(c=>c.v));const vr=avgv>0?last.v/avgv:1;
    const bid=orderbook?.b?.reduce((s,item)=>s+num(item[0])*num(item[1]),0);
    const ask=orderbook?.a?.reduce((s,item)=>s+num(item[0])*num(item[1]),0);
    const imbalance=finite(bid,ask)&&bid+ask>0?bid/(bid+ask):null;
    let oidelta=null;if(Array.isArray(oi)&&oi.length>=2){const entries=oi.map(x=>({ts:Number(x.timestamp),v:Number(x.openInterest)})).filter(x=>finite(x.ts,x.v)).sort((a,b)=>a.ts-b.ts);if(entries.length>=2&&entries.at(-2).v>0){oidelta=(entries.at(-1).v/entries.at(-2).v-1)*100;}}
    const funding=finite(num(ticker.fundingRate))?num(ticker.fundingRate):null;
    const factors=weightedSignals({e20,e50,e200,e20prev:e20a[n-5],r,macdHist,macdPrev,vr,imbalance,oidelta,funding});
    const frameSummaries=options.frames||{};const duration=evaluateDurations(frameSummaries);
    const feeSide=Number.isFinite(options.feeSide)?options.feeSide:.0006;
    const slipSide=Number.isFinite(options.slipSide)?options.slipSide:.00025;
    const calc=(kind)=>{
      const isLong=kind==='LONG';const direction=isLong?1:-1;
      const tick=Number(options.tickSize);const tickKnown=Number.isFinite(tick)&&tick>0;
      const quant=(v,mode='round')=>tickKnown?Math[mode](v/tick+1e-9)*tick:v;
      const zone=chooseZone(closed,livePrice,a,kind);
      const entry=quant(zone.level);
      const swing=pivots(closed,80);const stopLevels=(isLong?swing.lo:swing.hi).filter(v=>isLong?v<entry:v>entry).sort((x,y)=>Math.abs(x-entry)-Math.abs(y-entry));
      const structuralStop=stopLevels.find(v=>Math.abs(v-entry)>=a*.65&&Math.abs(v-entry)<=a*3.5);
      const baseRisk=Math.max(a*.95,entry*.002);
      const stop=quant(entry-direction*Math.max(baseRisk,structuralStop?Math.abs(entry-structuralStop)+a*.16:0),isLong?'floor':'ceil');
      const risk=Math.abs(entry-stop);
      const targets=structuralTargets(closed,entry,stop,kind,a,frameSummaries);
      const tp1=Number.isFinite(targets.tp1)?quant(targets.tp1,isLong?'floor':'ceil'):NaN;
      const tp2=Number.isFinite(targets.tp2)?quant(targets.tp2,isLong?'floor':'ceil'):NaN;
      const cost=entry*2*(feeSide+slipSide);
      const net1=Number.isFinite(tp1)?Math.max(0,((tp1-entry)*direction-cost)/(risk+cost)):0;
      const net2=Number.isFinite(tp2)?Math.max(0,((tp2-entry)*direction-cost)/(risk+cost)):0;
      const score=factors[kind.toLowerCase()];
      const distance=Math.abs(livePrice-entry);
      const near=distance<=Math.max(a*.48,entry*.0012);
      const canceled=isLong?livePrice<=stop:livePrice>=stop;
      const candleConfirm=isLong?last.c>last.o&&last.c>prev.c:last.c<last.o&&last.c<prev.c;
      const momentumConfirm=isLong?(macdHist>macdPrev&&r>=32):(macdHist<macdPrev&&r<=68);
      const orderConfirm=imbalance!==null&&(isLong?imbalance>=.53:imbalance<=.47);
      const volumeConfirm=vr>=1.10;
      const missing=imbalance===null;
      const netOk=Number.isFinite(tp1)&&Number.isFinite(tp2)&&net1>=1.15;
      const tfCoverage=Object.values(frameSummaries).filter(Boolean).length>=3;
      const higherDirection=[frameSummaries['240'],frameSummaries.D].filter(Boolean);
      const against=higherDirection.length>=1&&higherDirection.every(x=>x.trend!==(kind)&&x.trend!=='WAIT');
      const confirmed=near&&tickKnown&&!missing&&!canceled&&tfCoverage&&!against&&score.percentage>=64&&candleConfirm&&momentumConfirm&&orderConfirm&&volumeConfirm&&netOk;
      let state='가격대 대기';if(canceled)state='무효 / 취소';else if(confirmed)state='조건부 진입 신호';else if(near)state='가격 도달 · 재확인 WAIT';
      let reason=zone.origin+' · '+(near?'현재 가격이 진입 구간에 근접':'현재 가격이 진입 후보 구간 밖')+' · '+(candleConfirm?'완성봉 방향 확인':'완성봉 방향 미확인');
      const failed=[];if(!near)failed.push('진입 가격 미도달');if(!tickKnown)failed.push('계약 호가단위 미확인');if(missing)failed.push('호가 미수신');if(!candleConfirm)failed.push('반전봉 미확인');if(!momentumConfirm)failed.push('모멘텀 미확인');if(!orderConfirm)failed.push('호가 우위 부족');if(!volumeConfirm)failed.push('거래량 확인 부족');if(!netOk)failed.push('목표 매물대·순손익비 불충분');if(!tfCoverage)failed.push('다중 시간봉 분석 대기');if(against)failed.push('상위 시간봉 역추세 위험');
      return {kind,entry,stop,tp1,tp2,targetOrigin:targets.source,risk,lossPct:risk/entry*100,rr:net1,rr2:net2,score:score.percentage,details:score.detail,near,canceled,confirmed,state,reason,failed,distance,against};
    };
    const long=calc('LONG'),short=calc('SHORT');
    // 시장 신선도/연결 확인은 app.js에서 재차 검사. 서로 반대인 포지션 동시 확정은 피함.
    let verdict='WAIT',vreason='후보 진입 가격 도달 및 수급·완성봉 확인 대기';
    if(long.confirmed&&!short.confirmed){verdict='LONG';vreason='진입 구간 및 독립 확인 조건 충족';}
    else if(short.confirmed&&!long.confirmed){verdict='SHORT';vreason='진입 구간 및 독립 확인 조건 충족';}
    else if(long.confirmed&&short.confirmed){verdict='WAIT';vreason='양방향 상충 · 거래 보류';}
    const low48=Math.min(...closed.slice(-48).map(c=>c.l));const high48=Math.max(...closed.slice(-48).map(c=>c.h));
    return {verdict,vreason,long,short,frames:frameSummaries,duration,factors,indicators:{ema20:e20,ema50:e50,ema200:e200,rsi:r,atr:a,macd: m.hist[n-1],macdLine:m.line[n-1],macdSignal:m.sig[n-1],vr,imbalance,oidelta,funding,support:low48,resistance:high48,trend:e20>e50?'상승 배열':'하락 배열'},series:{ema20:e20a,ema50:e50a,rsi:rsia,macd:m.hist,macdLine:m.line,macdSignal:m.sig},closed,livePrice,updatedAt:Date.now(),reasonNotes:[`EMA20 ${e20>e50?'상승':'하락'} 배열 · EMA50 / EMA200 비교`,`RSI ${r.toFixed(1)}, MACD 변화 ${macdHist>macdPrev?'확대/개선':'감소/약화'}`,`최근 완성봉 거래량 ${vr.toFixed(2)}배`,imbalance===null?'호가 데이터 미수신':`호가 매수금액 비율 ${(imbalance*100).toFixed(1)}%`,oidelta===null?'OI 비교값 미수신':`OI 5분 변화 ${oidelta.toFixed(2)}%`,funding===null?'펀딩비 미수신':`펀딩비 ${(funding*100).toFixed(4)}%`,`지지 ${low48} / 저항 ${high48}`]};
  }
  return {analyze,ema,rsi,atr,macd,chooseZone,summarizeFrame,evaluateDurations,structuralTargets,leverageScenario};
})();
if (typeof module!=='undefined'&&module.exports) module.exports=TradeEngine;
