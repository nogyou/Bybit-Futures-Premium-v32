'use strict';
/* AI Position Manager v3.2.4: advisory ONLY. No orders, exchange account access or fill assumptions.
 * Assesses ONE manually recorded position on the selected symbol. Incoming public quote is
 * the observed last trade price, not a confirmed execution or exchange liquidation price.
 */
const PositionEngine = (() => {
  const finite=Number.isFinite;
  const sgn=side=>side==='LONG'?1:side==='SHORT'?-1:0;
  const useful=(price, entry, direction)=>finite(price)&&price>0&&direction*(price-entry)>0;
  function validate(p) {
    if (!p || !/^[A-Z0-9]{2,30}USDT$/.test(p.symbol||'') || !sgn(p.side) ||
        !finite(p.entry)||p.entry<=0 || !finite(p.stop)||p.stop<=0 ||
        (p.side==='LONG'?p.stop>=p.entry:p.stop<=p.entry) ||
        !finite(p.margin)||p.margin<=0 || !finite(p.leverage)||p.leverage<1||p.leverage>100 ||
        !finite(p.remainingPct)||p.remainingPct<=0||p.remainingPct>100) return false;
    return true;
  }
  function evaluate({position,analysis,price,now=Date.now(),quoteAgeMs=Infinity,analysisAgeMs=Infinity,
      bookAgeMs=Infinity,orderbook=null,feeSide=.0006,slipSide=.00025,lossBudget=10}={}) {
    if(!validate(position))return {status:'NOT_REGISTERED',label:'수동 등록된 포지션 없음',reasons:['실제 체결 정보를 직접 등록해야 추적할 수 있습니다.']};
    const dir=sgn(position.side), entry=position.entry, stop=position.stop;
    const observed=finite(price)&&price>0?price:NaN;
    const quoteFresh=finite(quoteAgeMs)&&quoteAgeMs<=30000;
    const analysisFresh=!!analysis&&analysisAgeMs<=75000&&!!analysis.indicators&&
      finite(analysis.indicators.atr)&&analysis.indicators.atr>0;
    const bookFresh=bookAgeMs<=65000&&finite(analysis?.indicators?.imbalance);
    const validData=quoteFresh&&analysisFresh;
    const notional=position.margin*position.leverage*(position.remainingPct/100);
    const roundTrip=(2*(Math.max(0,feeSide)+Math.max(0,slipSide)) + Math.abs(analysis?.indicators?.funding||0));
    const gross=finite(observed)?dir*(observed-entry)/entry*notional:NaN;
    const pnl=finite(gross)?gross-notional*roundTrip:NaN;
    const roi=finite(pnl)?pnl/position.margin*100:NaN; // based on ORIGINAL margin; remaining size reflected
    const adverseRisk=Math.abs(entry-stop)/entry*100;
    const riskLoss=(notional*(adverseRisk/100+roundTrip));
    const leverageRisk=adverseRisk*position.leverage>=60; // Not an exchange liquidation calculation.
    const atr=analysisFresh?analysis.indicators.atr:NaN;
    const maxFavorable=finite(position.maxFavorable)?position.maxFavorable:entry;
    // Suggestion (not an executed stop). Tighten only after an observed >=1.25 ATR favorable move.
    let protectedStop=finite(position.protectedStop)?position.protectedStop:stop;
    protectedStop=dir===1?Math.max(stop,protectedStop):Math.min(stop,protectedStop);
    if(analysisFresh&&dir*(maxFavorable-entry)>=atr*1.25){
      const trailing=maxFavorable-dir*atr*1.15;
      protectedStop=dir===1?Math.max(protectedStop,trailing):Math.min(protectedStop,trailing);
    }
    // Recalculate target levels from the user's ACTUAL recorded entry, not candidate setup entry.
    let targets={tp1:NaN,tp2:NaN,tp1Reason:'가격 구조 확인 대기',tp2Reason:'가격 구조 확인 대기'};
    if(analysisFresh&&Array.isArray(analysis.closed)&&analysis.closed.length>=50&&
       typeof TradeEngine!=='undefined'&&typeof TradeEngine.structuralTargets==='function'){
      targets=TradeEngine.structuralTargets(analysis.closed,entry,stop,position.side,atr,analysis.frames||{},bookFresh?orderbook:null);
    }
    const tp1=useful(targets.tp1,entry,dir)?targets.tp1:NaN;
    const tp2=useful(targets.tp2,entry,dir)?targets.tp2:NaN;
    const reasons=[];
    let status='HOLD',label='포지션 보유 검토',level='normal';
    if(!validData){status='WAIT_DATA';label='데이터 지연 · 판단 보류';level='warning';reasons.push('현재 시세 또는 완성봉 분석이 오래됨. 실시간 청산 판단 불가');}
    else {
      const x=analysis.indicators;
      const momentumAgainst=finite(x.macd)&&dir*x.macd<0;
      const trendAgainst=dir===1?x.ema20<x.ema50:x.ema20>x.ema50;
      const orderAgainst=bookFresh&&(dir===1?x.imbalance<.46:x.imbalance>.54);
      const volumeConfirm=finite(x.vr)&&x.vr>=1.1;
      const higher=Object.values(analysis.frames||{}).filter(f=>f&&['60','240','D'].includes(String(f.tf)));
      const higherAgainst=higher.length>=2&&higher.filter(f=>f.trend=== (dir===1?'SHORT':'LONG')).length>=2;
      const warnings=[momentumAgainst?'MACD 모멘텀 반대 방향':'',trendAgainst?'EMA20/50 추세 역행':'',orderAgainst?'호가 수급 반대 방향':'',higherAgainst?'상위 시간봉 방향 불일치':''].filter(Boolean);
      const underStop=dir*(observed-stop)<=0;
      const underProtection=dir*(observed-protectedStop)<=0&&dir*(protectedStop-stop)>0;
      if(underStop){status='STOP_REVIEW';label='손절 기준 이탈 · 즉시 확인';level='critical';reasons.push('기록된 손절가 이탈. 실제 주문 체결 여부를 거래소에서 직접 확인');}
      else if(underProtection){status='EXIT_REVIEW';label='보호 손절선 이탈 · 청산 검토';level='critical';reasons.push('수익 보호용 제안 손절선 아래/위로 이동');}
      else if(finite(tp2)&&dir*(observed-tp2)>=0){status='EXIT_REVIEW';label='2차 구조적 목표 도달 · 청산 검토';level='strong';reasons.push(targets.tp2Reason);}
      else if(finite(tp1)&&dir*(observed-tp1)>=0){status='PARTIAL_REVIEW';label='1차 목표 도달 · 분할익절 검토';level='strong';reasons.push(targets.tp1Reason);}
      else if(warnings.length>=2 && volumeConfirm && finite(pnl) && pnl>0){status='EXIT_REVIEW';label='추세 약화 · 조기 청산 검토';level='strong';reasons.push(...warnings.slice(0,3),'거래량 동반 추세 약화');}
      else if(warnings.length>=2){status='RISK_REVIEW';label='추세 충돌 · 위험 재평가';level='warning';reasons.push(...warnings.slice(0,3));}
      else{reasons.push('주요 종료 조건 미충족 · 다음 완성봉과 수급 재확인');}
      if(!bookFresh)reasons.push('호가 정보 지연/누락 · 강한 청산 판단 제한');
      if(leverageRisk){reasons.push('선택 배율에서 손절 전 청산 가능성 있음(청산가 미산출)');
        if(status==='HOLD'){status='RISK_REVIEW';label='고배율 · 청산 위험 검토';level='warning';}}
      if(finite(lossBudget)&&lossBudget>0&&riskLoss>lossBudget){reasons.push('설정한 1회 허용 손실액 초과');
        if(status==='HOLD'){status='RISK_REVIEW';label='허용 손실 초과 · 위험 재평가';level='warning';}}
    }
    const tpValue=target=>finite(target)? (dir*(target-entry)/entry*notional-notional*roundTrip):NaN;
    return {status,label,level,reasons,price:observed,entry,stop,protectedStop,tp1,tp2,
      tp1Reason:targets.tp1Reason,tp2Reason:targets.tp2Reason,margin:position.margin,
      leverage:position.leverage,remainingPct:position.remainingPct,notional,pnl,roi,riskLoss,
      tp1Pnl:tpValue(tp1),tp2Pnl:tpValue(tp2),riskPct:adverseRisk,
      leverageRisk,validData,analysisTime:analysis?.updatedAt||0,quoteAgeMs,analysisAgeMs,bookFresh,
      note:'시세·과거 봉·일시적인 호가에서 얻은 참고 판단. 자동 주문/확정 체결·청산가·실제 수익 보장 없음.'};
  }
  function entryAlert({analysis,quoteAgeMs=Infinity,analysisAgeMs=Infinity,bookAgeMs=Infinity,riskGate='',maxLev=100,leverage=1}={}){
    if(!analysis||quoteAgeMs>30000||analysisAgeMs>75000||bookAgeMs>65000)
      return {kind:'WAIT',label:'데이터 점검 · 진입 판단 보류',detail:'시세·완성봉·호가가 최신 상태가 아닙니다.',strong:false};
    if(riskGate)return {kind:'WAIT',label:'위험 한도 초과 · 진입 보류',detail:riskGate,strong:false};
    if(!Number.isFinite(maxLev)||leverage>maxLev)
      return {kind:'WAIT',label:'종목 허용 배율 확인 필요',detail:'거래소 배율 정보 또는 선택 배율을 확인하세요.',strong:false};
    const side=analysis.verdict;
    const plan=side==='LONG'?analysis.long:side==='SHORT'?analysis.short:null;
    if(!plan||!plan.confirmed||!Number.isFinite(plan.tp1)||!Number.isFinite(plan.tp2)||
        !Number.isFinite(plan.stop)||!Number.isFinite(plan.entry))
      return {kind:'WAIT',label:'관심 가격대 감시 중',detail:analysis.vreason||'진입 조건 확인 대기',strong:false};
    return {kind:side,label:`${side} 진입 조건 확인 · 직접 검토`,detail:`진입 ${plan.entry} · TP1 ${plan.tp1} · TP2 ${plan.tp2} · SL ${plan.stop} · 조건 점수 ${plan.score}% (승률 아님)`,strong:true,plan};
  }
  return {evaluate,validate,entryAlert};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=PositionEngine;
