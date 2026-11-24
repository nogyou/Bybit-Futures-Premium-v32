/* v3.2.6: LONG/SHORT는 서로 독립 평가. 점수는 승률이 아님. */
'use strict';
const TradeComparison = (()=>{
  const MODES=['scalp','short','long'];
  const LABELS={scalp:'단타',short:'단기',long:'장기'};
  function compare(analysis,opts={}){
    const stale=opts.stale!==false?!!opts.stale:false;
    const selected=opts.selectedMode||analysis?.strategy?.key||'short';
    const risk=typeof opts.risk==='function'?opts.risk:()=>'';
    if(!analysis)return {selected,verdict:'WAIT',reason:'해당 기간 분석 데이터 부족',sides:[]};
    const evaluated=['LONG','SHORT'].map(side=>{
      const p=analysis[side.toLowerCase()];
      const blocked=risk(analysis,side)||'';
      const valid=!!p&&Number.isFinite(p.entry)&&Number.isFinite(p.stop)&&Number.isFinite(p.tp1)&&Number.isFinite(p.tp2);
      const ready=!stale&&valid&&!blocked&&analysis.verdict===side&&p.confirmed;
      let status='후보 대기';
      if(stale)status='데이터 지연 · WAIT';
      else if(!valid)status='목표가 미확보 · WAIT';
      else if(blocked)status='위험 초과 · WAIT';
      else if(p.canceled)status='무효 · WAIT';
      else if(ready)status='조건부 진입 검토';
      else if(p.near)status='가격 도달 · 확인 대기';
      const scenario=valid&&typeof opts.scenario==='function'?opts.scenario(p,side,analysis):null;
      return {side,status,ready,blocked,plan:p,scenario,score:p?.score??null,rr:p?.rr??null,
        reasons:p?.failed?.slice(0,2)||[],target:p?.tp1Reason||'목표가 미산출'};
    });
    const ready=evaluated.filter(p=>p.ready);
    const verdict=ready.length===1?ready[0].side:'WAIT';
    const reason=stale?'시세·분석 데이터 지연':ready.length===1?`${verdict} 확인 조건 충족 · 직접 검토`:ready.length>1?'방향 상충 · 거래 보류':'양방향 조건 미충족 · 진입 대기';
    return {selected,verdict,reason,sides:evaluated};
  }
  return {compare,MODES,LABELS};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TradeComparison;
