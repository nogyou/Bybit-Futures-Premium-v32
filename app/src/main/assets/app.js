'use strict';
/* API는 공개 Bybit V5 시장 데이터만 사용. 로그인/API 키/주문 기능 없음. */
(() => {
  const $=id=>document.getElementById(id);
  const timeFmt=t=>new Date(t).toLocaleTimeString('ko-KR',{hour12:false});
  const fmt=TradeChart.format;
  const currency=v=>{const n=Number(v);if(!Number.isFinite(n))return '--';if(n>=1e9)return (n/1e9).toFixed(2)+'B';if(n>=1e6)return (n/1e6).toFixed(1)+'M';if(n>=1e3)return (n/1e3).toFixed(1)+'K';return n.toFixed(1);};
  const pct=n=>(Number.isFinite(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'--');
  const number=v=>Number(v);
  const symbolNames={BTC:'비트코인',ETH:'이더리움',SOL:'솔라나',XRP:'리플',DOGE:'도지코인',BNB:'BNB',ADA:'에이다',AVAX:'아발란체',LINK:'체인링크',SUI:'수이',TRX:'트론',LTC:'라이트코인',DOT:'폴카닷',BCH:'비트코인캐시',NEAR:'니어',APT:'앱토스',PEPE:'페페',TON:'톤',UNI:'유니스왑',ARB:'아비트럼',OP:'옵티미즘'};
  const symbolsLogo={BTC:['₿','#f79a19'],ETH:['◆','#586bcc'],SOL:['≋','#6856c9'],XRP:['×','#263747'],DOGE:['Ð','#b69a31'],BNB:['◇','#eaa91c'],ADA:['✳','#337ae3'],AVAX:['▲','#e13c4d'],LINK:['⬡','#2462d4'],SUI:['◈','#4caad7'],TRX:['△','#d74444'],LTC:['Ł','#2a72be'],DOT:['●','#d63795'],BCH:['₿','#4ab077'],TON:['◇','#3586c5'],PEPE:['◉','#3e9956']};
  const strategyCaption={scalp:'단타 · 5분봉 중심 + 15분·1시간 방향',short:'단기 · 30분봉 중심 + 1·4시간 방향',long:'장기 · 일봉 중심 + 4시간·주봉 방향'};
  const state={symbol:'BTCUSDT',interval:'15',strategyMode:'short',strategyCandles:[],modeSnapshots:{},chartAnalysis:null,tickers:[],universe:null,candles:[],analysis:null,ticker:null,orderbook:null,oi:null,sort:'change-desc',filter:'',favsOnly:false,favs:new Set(),instrumentTicks:{},instrumentMax:{},liveMap:{},stream:null,streamReady:false,streamStatus:'대기',frames:{},frameUpdated:0,leverage:10,margin:100,lossBudget:10,marginMode:'isolated',lastMarket:0,selectedLastTick:0,lastAnalysis:0,lastBook:0,lastOi:0,error:'',seq:0,pollMarket:false,pollDetail:false,enableRefresh:true,fee:.0006,slip:.00025};
  try{state.favs=new Set(JSON.parse(localStorage.getItem('v32-favs')||'[]'));state.fee=Number(localStorage.getItem('v32-fee')||'.0006');state.slip=Number(localStorage.getItem('v32-slip')||'.00025');state.leverage=Number(localStorage.getItem('v32-leverage')||'10');state.margin=Number(localStorage.getItem('v32-margin')||'100');state.lossBudget=Number(localStorage.getItem('v32-loss-budget')||'10');state.marginMode=localStorage.getItem('v32-margin-mode')||'isolated';const savedMode=localStorage.getItem('v325-strategy-mode');if(['scalp','short','long'].includes(savedMode))state.strategyMode=savedMode;}catch(_){/* private app only */}
  const requestPending=new Map();let nextRequest=0;
  window.__receive=(id,raw,error)=>{const x=requestPending.get(id);if(!x)return;requestPending.delete(id);clearTimeout(x.timer);if(error){x.reject(new Error(error));return;}try{const obj=JSON.parse(raw);if(obj.retCode!==0)throw new Error(obj.retMsg||'API 응답 오류');x.resolve(obj.result||{});}catch(e){x.reject(e);}};
  function api(endpoint){return new Promise((resolve,reject)=>{if(typeof window.AndroidBridge==='undefined'){
        // 브라우저 직접 시연은 공개 REST CORS 설정에 따라 실패할 수 있다. 실패시 가짜 데이터 사용 안 함.
        fetch('https://api.bybit.com'+endpoint,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(x=>{if(x.retCode!==0)throw new Error(x.retMsg);resolve(x.result||{});}).catch(reject);return;
      }
      const id=String(++nextRequest),timer=setTimeout(()=>{if(requestPending.has(id)){requestPending.delete(id);reject(new Error('요청 시간 초과'));}},27000);
      requestPending.set(id,{resolve,reject,timer});try{window.AndroidBridge.request(id,endpoint);}catch(e){requestPending.delete(id);clearTimeout(timer);reject(e);}
    });}
  function toast(s){const el=$('toast');el.textContent=s;el.style.display='block';clearTimeout(toast._timer);toast._timer=setTimeout(()=>{el.style.display='none';},3000);}
  function setStatus(s,kind='warn'){ $('statusDot').className='dot'+(kind==='ok'?'':kind==='err'?' err':' warn');$('statusText').textContent=s;}
  function logo(s,large=false){const short=s.replace(/USDT$/,'');const [glyph,col]=symbolsLogo[short]||[short.charAt(0),'#344c64'];return `<div class="coin-logo${large?' large':''}" style="background:${col}">${glyph}</div>`;}
  function saveFav(){try{localStorage.setItem('v32-favs',JSON.stringify([...state.favs]));}catch(_){}}
  function toggleFav(s){if(state.favs.has(s))state.favs.delete(s);else state.favs.add(s);saveFav();renderMarket();renderHeader();}
  function sortedTickers(){let list=state.tickers;
    if(state.universe?.size){list=list.filter(x=>state.universe.has(x.symbol));}else list=list.filter(x=>x.symbol.endsWith('USDT'));
    if(state.favsOnly)list=list.filter(x=>state.favs.has(x.symbol));
    if(state.filter){const q=state.filter.toUpperCase();list=list.filter(x=>x.symbol.includes(q)||symbolNames[x.symbol.replace(/USDT$/,'')]?.includes(state.filter));}
    const arr=list.slice();const ch=x=>Number(x.price24hPcnt)||0;const price=x=>Number(x.lastPrice)||0;const volume=x=>Number(x.turnover24h)||0;
    arr.sort((a,b)=>{switch(state.sort){case 'change-asc':return ch(a)-ch(b);case 'volume-desc':return volume(b)-volume(a);case 'price-asc':return price(a)-price(b);case 'price-desc':return price(b)-price(a);default:return ch(b)-ch(a);}});return arr;}
  function renderMarket(){const list=sortedTickers();const priorScroll=$('marketList').scrollTop;$('marketCount').textContent='USDT 무기한 선물';$('marketList').replaceChildren();
    if(!list.length){$('marketList').innerHTML='<div class="list-placeholder">'+(state.tickers.length?'검색 결과가 없습니다.':'Bybit 선물 전체 시장 데이터를 조회하고 있습니다.')+'</div>';}else{
      const fragment=document.createDocumentFragment();for(const row of list){const sym=row.symbol,change=Number(row.price24hPcnt)*100;const div=document.createElement('div');div.dataset.symbol=sym;div.className='market-item'+(sym===state.symbol?' selected':'');div.innerHTML=`${logo(sym)}<div><div class="market-symbol">${sym}</div><div class="market-name">${symbolNames[sym.replace(/USDT$/,'')]||'선물 마켓'}</div></div><div class="market-price">${fmt(Number(row.lastPrice))}</div><div class="market-change ${change>=0?'positive':'negative'}">${pct(change)}</div><button class="star-btn ${state.favs.has(sym)?'faved':''}" title="관심 종목" aria-label="관심 종목">${state.favs.has(sym)?'★':'☆'}</button>`;div.addEventListener('click',e=>{if(e.target.closest('.star-btn')){toggleFav(sym);return;}selectSymbol(sym);});fragment.appendChild(div);} $('marketList').appendChild(fragment);
    }
    $('marketList').scrollTop=priorScroll;
    $('visibleCount').textContent=`${list.length}개 표시 / ${state.universe?.size||state.tickers.filter(x=>x.symbol.endsWith('USDT')).length}개 검색`;
    document.querySelectorAll('[data-sort]').forEach(b=>b.classList.toggle('selected',b.dataset.sort===state.sort));$('sortIcon').textContent=state.sort==='change-asc'?'↑':'↓';
    $('allTab').classList.toggle('selected',!state.favsOnly);$('favTab').classList.toggle('selected',state.favsOnly);
  }
  function renderHeader(){const row=state.ticker||state.tickers.find(x=>x.symbol===state.symbol);const sym=state.symbol,base=sym.replace(/USDT$/,'');$('symbolTitle').textContent=sym;$('heroLogo').outerHTML=logo(sym,true).replace('class="coin-logo large"','id="heroLogo" class="coin-logo large"');$('heroFav').textContent=state.favs.has(sym)?'★':'☆';$('heroFav').classList.toggle('faved',state.favs.has(sym));
    if(!row)return;renderLivePrice(row);}
  function renderLivePrice(row){const ch=Number(row.price24hPcnt)*100;$('currentPrice').textContent=fmt(Number(row.lastPrice));$('currentPrice').className=ch>=0?'positive':'negative';$('priceChange').textContent=pct(ch)+' (24H)';$('priceChange').className=ch>=0?'positive':'negative';$('high24').textContent=fmt(Number(row.highPrice24h));$('low24').textContent=fmt(Number(row.lowPrice24h));$('volume24').textContent=currency(Number(row.turnover24h))+' USDT';}
  function planRender(kind,p){
    const pre=kind.toLowerCase();
    for(const [id,value] of Object.entries({Entry:p?.entry,Tp1:p?.tp1,Tp2:p?.tp2,Sl:p?.stop})){
      $(pre+id).textContent=Number.isFinite(value)?fmt(value):'--';
    }
    $(pre+'Loss').textContent=p?p.lossPct.toFixed(2)+'%':'--';
    $(pre+'RR').textContent=p?'1 : '+p.rr.toFixed(2)+' (TP1 순비용)':'--';
    $(pre+'State').textContent=p?p.state:'자료 대기';
    $(pre+'Reason').textContent=p?(p.reason+' · '+(p.failed?.length?'보류: '+p.failed.slice(0,3).join(', '):'진입 조건 점검 중')):'실제 데이터 분석 대기';
    const s=$(pre+'TargetSummary'),detail=$(pre+'TargetDetail');
    if(!p){s.textContent='시장 구조 기반 목표 가격 분석 대기';detail.textContent='분석 데이터가 없습니다.';return;}
    s.textContent=Number.isFinite(p.tp1)?`TP1: ${p.tp1Reason||'근거 부족'}`:'TP1: 구조적 목표가 부족하여 WAIT';
    detail.textContent=`TP1 ${Number.isFinite(p.tp1)?fmt(p.tp1):'미산출'} : ${p.tp1Reason||'근거 부족'}\nTP2 ${Number.isFinite(p.tp2)?fmt(p.tp2):'미산출'} : ${p.tp2Reason||'근거 부족'}\n※ 과거 캔들에서 확인한 구조와 추정 거래량 분포에 근거한 가격 후보입니다. 매도벽/매수벽을 예측한 값은 아니며 뉴스는 TP 산출에 반영하지 않았습니다. 시장 변동 시 재산출합니다.`;
  }
  function evidence(name,value,status='neutral'){const row=document.createElement('div');row.className='evidence-row';const bullet=document.createElement('span');bullet.className='ev-dot'+(status==='bad'?' bad':status==='neutral'?' warn':'');bullet.textContent=status==='bad'?'×':status==='neutral'?'○':'✓';const label=document.createElement('span');label.className='ev-name';label.textContent=name;const val=document.createElement('span');val.className='ev-val';val.textContent=value;row.append(bullet,label,val);return row;}
  // One manually recorded position, locally stored ONLY on this device. No API keys or orders.
  const POSITION_STORAGE='v324-manual-position';
  let activePosition=null, blinkEnabled=true, soundEnabled=false, soundContext=null, lastExitAlertKey='',lastExitAlertAt=0,lastPositionUi=0,lastPositionPersist=0;
  try{const raw=JSON.parse(localStorage.getItem(POSITION_STORAGE)||'null');if(PositionEngine.validate(raw))activePosition=raw;
    blinkEnabled=localStorage.getItem('v324-blink')!=='off';}catch(_){}
  // Web Audio may require a user gesture on Android WebView; OFF until the button is tapped.
  function soundToggleUI(){const el=$('alertSoundToggle');el.textContent=soundEnabled?'소리 켜짐':'소리 꺼짐';el.classList.toggle('sound-enabled',soundEnabled);el.setAttribute('aria-pressed',String(soundEnabled));}
  async function enableSoundFromTap(){
    if(soundEnabled){soundEnabled=false;soundToggleUI();toast('진입 신호 소리 알림 꺼짐');return;}
    try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)throw new Error('이 브라우저에서 소리 재생 불가');
      soundContext??=new Ctx();await soundContext.resume();soundEnabled=soundContext.state==='running';soundToggleUI();toast(soundEnabled?'진입 신호 소리 켜짐 · 앱을 켜 둔 동안만':'소리 활성화 실패');
    }catch(e){soundEnabled=false;soundToggleUI();toast('이 기기에서 소리 알림을 켤 수 없습니다.');}
  }
  function playSignalTone(side){
    if(!soundEnabled||!soundContext||soundContext.state!=='running'||!state.enableRefresh)return;
    try{const start=soundContext.currentTime;const notes=side==='LONG'?[660,880]:[880,600];
      notes.forEach((hz,i)=>{const osc=soundContext.createOscillator(),gain=soundContext.createGain(),t=start+i*.18;
        osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.1,t+.025);gain.gain.exponentialRampToValueAtTime(.0001,t+.16);
        osc.connect(gain).connect(soundContext.destination);osc.start(t);osc.stop(t+.17);});
    }catch(e){console.warn('알림 소리 재생 실패',e);}
  }
  function storePosition(){try{if(activePosition)localStorage.setItem(POSITION_STORAGE,JSON.stringify(activePosition));else localStorage.removeItem(POSITION_STORAGE);}catch(_){toast('포지션 기록 저장 실패 · 기기 저장공간 확인');}}
  function positionPrice(){const p=Number(state.ticker?.lastPrice??state.liveMap[state.symbol]?.lastPrice);return Number.isFinite(p)&&p>0?p:NaN;}
  function positionMetrics(){
    if(!activePosition||activePosition.symbol!==state.symbol)return null;
    const age=Date.now()-(state.selectedLastTick||0);
    return PositionEngine.evaluate({position:activePosition,analysis:state.analysis,price:positionPrice(),
      quoteAgeMs:age,analysisAgeMs:Date.now()-(state.lastAnalysis||0),bookAgeMs:Date.now()-(state.lastBook||0),
      orderbook:state.orderbook,feeSide:state.fee,slipSide:state.slip,lossBudget:state.lossBudget});
  }
  function renderEntryAlert(){
    const livePosition=positionMetrics();
    if(livePosition){
      const box=$('tradeAlert');
      const urgent=['PARTIAL_REVIEW','EXIT_REVIEW','STOP_REVIEW'].includes(livePosition.status);
      box.className='trade-alert '+(urgent?(livePosition.status==='STOP_REVIEW'?'short':'long'):'neutral')+(urgent&&blinkEnabled?' alert-blink':'');
      $('tradeAlertTitle').textContent=urgent?'⚠ AI EXIT ALERT · '+livePosition.label:'◉ AI POSITION · '+livePosition.label;
      $('tradeAlertText').textContent=`${activePosition.side} 진입 ${fmt(activePosition.entry)} · 현재 ${Number.isFinite(livePosition.price)?fmt(livePosition.price):'--'} · TP1 ${Number.isFinite(livePosition.tp1)?fmt(livePosition.tp1):'미산출'} · 제안 보호손절 ${fmt(livePosition.protectedStop)}`;
      $('tradeAlertTime').textContent=livePosition.validData?`최근 분석 ${timeFmt(state.lastAnalysis)} · 주문/체결 자동 실행 안 됨`:'데이터 지연 · 최신 청산 신호 아님';
      $('alertBlinkToggle').textContent=blinkEnabled?'점멸 켜짐':'점멸 꺼짐';
      SignalAlerts.observe(state.symbol+'|'+state.strategyMode,'WAIT');
      return;
    }
    const maxAllowed=state.instrumentMax[state.symbol];const alert=PositionEngine.entryAlert({analysis:state.analysis,
      quoteAgeMs:Date.now()-(state.selectedLastTick||0),analysisAgeMs:Date.now()-(state.lastAnalysis||0),
      bookAgeMs:Date.now()-(state.lastBook||0),riskGate:state.error||(!state.enableRefresh?'앱 비활성화 · 진입 보류':'')||checkTradeRisk(state.analysis,state.analysis?.verdict),
      maxLev:Number.isFinite(maxAllowed)?maxAllowed:NaN,leverage:state.leverage});
    const box=$('tradeAlert');box.className='trade-alert '+(alert.strong?alert.kind.toLowerCase():'neutral')+(alert.strong&&blinkEnabled?' alert-blink':'');
    $('tradeAlertTitle').textContent=alert.strong?'⚡ AI TRADE ALERT · '+alert.label:'◉ AI TRADE ALERT · '+alert.label;
    $('tradeAlertText').textContent=alert.strong&&alert.plan?
      `${state.symbol} | 진입 ${fmt(alert.plan.entry)} · TP1 ${fmt(alert.plan.tp1)} · TP2 ${fmt(alert.plan.tp2)} · SL ${fmt(alert.plan.stop)}`:alert.detail;
    $('tradeAlertTime').textContent=alert.strong?`조건 확인 ${timeFmt(Date.now())} · 배율 ${state.leverage}x · 주문 전 직접 확인`:'※ 관심구간은 확정 매매 신호가 아닙니다.';
    $('alertBlinkToggle').textContent=blinkEnabled?'점멸 켜짐':'점멸 꺼짐';
    const transition=SignalAlerts.observe(state.symbol+'|'+state.strategyMode,alert.strong?alert.kind:'WAIT');
    if(transition.transition){
      toast(`⚡ ${state.symbol} ${state.strategyMode==='scalp'?'단타':state.strategyMode==='short'?'단기':'장기'} ${alert.kind} 진입 조건 확인 · 직접 검토`);
      playSignalTone(alert.kind);
    }
  }
  function beginPositionForm(){
    const form=$('positionForm');form.hidden=!form.hidden;
    if(form.hidden)return;
    $('positionSymbol').textContent=state.symbol;
    $('positionEntry').value=Number.isFinite(positionPrice())?positionPrice():'';
    $('positionMargin').value=state.margin;
    $('positionLeverage').value=state.leverage;
    const p=state.analysis?.[$('positionSide').value.toLowerCase()];
    $('positionStop').value=Number.isFinite(p?.stop)&&Number.isFinite(positionPrice())&&
      ($('positionSide').value==='LONG'?p.stop<positionPrice():p.stop>positionPrice())?p.stop:'';
  }
  function saveManualPosition(){
    const side=$('positionSide').value,entry=Number($('positionEntry').value),stop=Number($('positionStop').value);
    const margin=Number($('positionMargin').value),leverage=Number($('positionLeverage').value),cap=state.instrumentMax[state.symbol];
    const pos={symbol:state.symbol,side,entry,stop,margin,leverage,remainingPct:100,
      recordedAt:Date.now(),maxFavorable:entry,protectedStop:stop};
    if(!PositionEngine.validate(pos)){toast('진입가·손절가·증거금·배율 확인 (LONG 손절<진입, SHORT 손절>진입)');return;}
    if(Number.isFinite(cap)&&leverage>cap){toast('해당 종목의 거래소 최대 배율을 초과했습니다.');return;}
    if(activePosition && !window.confirm('기존 수동 포지션 기록을 새 기록으로 교체할까요? 실제 거래소 주문에는 영향을 주지 않습니다.'))return;
    activePosition=pos;storePosition();$('positionForm').hidden=true;renderEntryAlert();renderPosition();toast('수동 포지션 추적 시작 · Bybit에 주문하지 않았습니다.');
  }
  function renderPosition(){
    const root=$('positionSummary'),actions=$('positionActions');if(!root)return;
    root.replaceChildren();actions.hidden=!activePosition||activePosition.symbol!==state.symbol;
    if(!activePosition){root.textContent='포지션을 직접 등록하면 AI가 보유·부분익절·청산을 검토합니다. 자동 주문 없음.';return;}
    if(activePosition.symbol!==state.symbol){
      root.textContent=`${activePosition.symbol} ${activePosition.side} 수동 기록 있음 · 현재 ${state.symbol} 차트를 보고 있어 감시 중지. 기록된 종목을 선택해야 재평가합니다.`;
      return;
    }
    const result=positionMetrics();if(!result){root.textContent='가격·분석 데이터가 없어 판단 대기';return;}
    $('positionRemaining').value=String(activePosition.remainingPct);
    const summary=document.createElement('div');summary.className='position-status '+(result.level==='critical'?'critical':result.level==='warning'?'warn':'good');
    summary.textContent=`${activePosition.symbol} ${activePosition.side} · ${result.label}`;root.appendChild(summary);
    const grid=document.createElement('div');grid.className='position-numbers';
    const pairs=[['기록 진입가',fmt(activePosition.entry)],['현재가',Number.isFinite(result.price)?fmt(result.price):'--'],
      ['1차 구조적 익절',Number.isFinite(result.tp1)?fmt(result.tp1):'확인 전'],
      ['2차 구조적 익절',Number.isFinite(result.tp2)?fmt(result.tp2):'확인 전'],
      ['초기 손절가',fmt(activePosition.stop)],['제안 보호손절',Number.isFinite(result.protectedStop)?fmt(result.protectedStop):'--'],
      ['기록된 사용 배율',activePosition.leverage+'x'],['증거금 / 잔여 비율',activePosition.margin+' USDT · '+activePosition.remainingPct+'%'],
      [`추정 순손익 ${activePosition.remainingPct}% 잔량`,Number.isFinite(result.pnl)?`${result.pnl>=0?'+':''}${result.pnl.toFixed(2)} USDT`:'--'],
      ['원래 증거금 대비 추정 ROI',Number.isFinite(result.roi)?`${result.roi>=0?'+':''}${result.roi.toFixed(2)}%`:'--']];
    pairs.forEach(([key,val])=>{const box=document.createElement('div'),k=document.createElement('small'),v=document.createElement('b');k.textContent=key;v.textContent=val;box.append(k,v);grid.appendChild(box);});root.appendChild(grid);
    const note=document.createElement('div');note.className='position-reasons';
    note.textContent=`판단 근거: ${result.reasons.join(' · ')}${Number.isFinite(result.tp1)?' · TP1: '+result.tp1Reason:''}${Number.isFinite(result.tp2)?' · TP2: '+result.tp2Reason:''}`;root.appendChild(note);
    const info=document.createElement('div');info.className='position-footnote';
    info.textContent=`기록 ${new Date(activePosition.recordedAt).toLocaleString('ko-KR')} · 분석 ${state.lastAnalysis?timeFmt(state.lastAnalysis):'미수신'} · 최근 체결가 참고 / 미체결·실제 계좌 미연동 · 수수료/슬리피지 추정`;
    root.appendChild(info);
    if(['PARTIAL_REVIEW','EXIT_REVIEW','STOP_REVIEW'].includes(result.status)){
      const key=`position-${activePosition.symbol}-${result.status}`;
      if(lastExitAlertKey!==key||Date.now()-lastExitAlertAt>120000){lastExitAlertKey=key;lastExitAlertAt=Date.now();toast('⚠ '+result.label+' · '+activePosition.symbol+' (주문 자동 실행 안 됨)');}
    }
  }
  function updatePositionMonitor(){
    if(!activePosition||activePosition.symbol!==state.symbol)return;
    const px=positionPrice(),age=Date.now()-(state.selectedLastTick||0),dir=activePosition.side==='LONG'?1:-1;
    if(!Number.isFinite(px)||age>30000)return;
    const old=activePosition.maxFavorable;
    if(!Number.isFinite(old)||dir*(px-old)>0)activePosition.maxFavorable=px;
    if(state.analysis&&Date.now()-state.lastAnalysis<75000){
      const result=positionMetrics();if(result&&result.validData&&Number.isFinite(result.protectedStop)){
        const oldStop=activePosition.protectedStop;
        activePosition.protectedStop=dir===1?Math.max(activePosition.stop,oldStop,result.protectedStop):Math.min(activePosition.stop,oldStop,result.protectedStop);
      }
    }
    if(Date.now()-lastPositionPersist>5000){lastPositionPersist=Date.now();storePosition();}
    if(Date.now()-lastPositionUi>1200){lastPositionUi=Date.now();renderEntryAlert();renderPosition();}
  }
  function renderStrategyMode(a=null){
    document.querySelectorAll('[data-strategy]').forEach(b=>{const selected=b.dataset.strategy===state.strategyMode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    $('modeContext').textContent=strategyCaption[state.strategyMode];
    const el=$('modeCurrent');el.className='mode-current';
    if(!a){el.textContent='선택 전략 분석 대기 · 데이터 없으면 WAIT';return;}
    const current=Number(state.ticker?.lastPrice),side=a.verdict;
    if(side==='LONG'||side==='SHORT'){
      const p=a[side.toLowerCase()],r=checkTradeRisk(a,side);
      if(r){el.textContent=`현재가 ${fmt(current)} · ${r}`;el.classList.add('warning');}
      else{el.textContent=`현재가 ${fmt(current)} · ${side} 조건부 진입 검토 · 진입구간 ${fmt(p.entry)} / TP1 ${fmt(p.tp1)} / SL ${fmt(p.stop)}`;el.classList.add('ready');}
    } else {
      const nearest=[a.long,a.short].filter(p=>p&&Number.isFinite(p.entry)).sort((x,y)=>Math.abs(x.entry-current)-Math.abs(y.entry-current))[0];
      const zone=nearest?`${nearest.kind} 후보 ${fmt(nearest.entry)} · ${nearest.near?'가격대 근처, 조건 미충족':'가격대 도달 대기'}`:'가격 구조 확인 대기';
      el.textContent=`현재가 ${fmt(current)} · WAIT · ${zone}`;
    }
  }
  function riskScenarioFor(p,side,analysis){return TradeEngine.leverageScenario(p,side,{leverage:state.leverage,margin:state.margin,mode:state.marginMode,feeSide:state.fee,slipSide:state.slip,funding:analysis.indicators.funding});}
  function riskStatusFor(analysis,side){return checkTradeRisk(analysis,side);}
  function renderDualCompare(){
    const overview=$('modeOverview'),cols=$('dualColumns'),foot=$('dualSummary');
    overview.replaceChildren();cols.replaceChildren();
    const fresh=Date.now()-(state.selectedLastTick||0)<=35000&&Date.now()-state.lastBook<=65000&&!state.error;
    const present=Object.assign({},state.modeSnapshots);
    if(state.analysis)present[state.strategyMode]={analysis:state.analysis,at:state.lastAnalysis,candles:state.strategyCandles};
    for(const key of TradeComparison.MODES){
      const row=present[key],expired=!fresh||!row||Date.now()-row.at>75000;
      const summary=TradeComparison.compare(row?.analysis,{stale:expired,selectedMode:key,risk:riskStatusFor,scenario:riskScenarioFor});
      const btn=document.createElement('button');btn.type='button';btn.className=key===state.strategyMode?'active':'';
      const title=document.createElement('strong');title.textContent=TradeComparison.LABELS[key];
      const status=document.createElement('span');status.textContent=expired?'WAIT':summary.verdict;status.className=expired?'':summary.verdict.toLowerCase();
      const detail=document.createElement('small');detail.textContent=expired?'분석 대기':`L ${row.analysis.long.score}% / S ${row.analysis.short.score}%`;
      btn.append(title,status,detail);btn.addEventListener('click',()=>changeStrategy(key));overview.append(btn);
    }
    const a=state.analysis,stale=!a||!fresh||Date.now()-state.lastAnalysis>75000;
    const result=TradeComparison.compare(a,{stale,selectedMode:state.strategyMode,risk:riskStatusFor,scenario:riskScenarioFor});
    for(const side of ['LONG','SHORT']){
      const x=result.sides.find(v=>v.side===side);const card=document.createElement('div');card.className='dual-card '+side.toLowerCase();
      const title=document.createElement('h4');title.textContent=side+' 분석';card.append(title);
      const badge=document.createElement('div');badge.className='dual-badge'+(x?.ready?' ready':'');badge.textContent=x?.status||'데이터 대기';card.append(badge);
      const line=(name,value)=>{const div=document.createElement('div');div.className='dual-row';const s=document.createElement('span');s.textContent=name;const b=document.createElement('b');b.textContent=value;div.append(s,b);card.append(div);};
      if(x?.plan){const p=x.plan;
        line('지표 부합',Number.isFinite(x.score)?x.score+'% (승률 아님)':'--');
        line('진입 후보',fmt(p.entry));line('TP1 / TP2',fmt(p.tp1)+' / '+fmt(p.tp2));line('손절',fmt(p.stop));
        line('순비용 TP1 손익비',Number.isFinite(x.rr)?'1 : '+x.rr.toFixed(2):'--');
        const r=x.scenario,roi=v=>Number.isFinite(v)?(v>=0?'+':'')+v.toFixed(1)+'%':'--';
        line('선택 '+state.leverage+'x TP1 ROI',roi(r?.tp1Roi));line('선택 '+state.leverage+'x SL ROI',roi(r?.slRoi));
        const why=document.createElement('div');why.className='dual-why';why.textContent=x.blocked||p.failed?.slice(0,2).join(' · ')||p.tp1Reason||'판단 근거 확인 대기';card.append(why);
      }else line('상태','실시간 분석 대기');
      cols.append(card);
    }
    foot.textContent=result.verdict==='WAIT'?'현재 즉시 진입: WAIT · '+result.reason+' · 아래 후보 가격은 지금 주문하라는 뜻이 아닙니다.':`현재 조건부 ${result.verdict} 검토 · 선택 기간 ${TradeComparison.LABELS[state.strategyMode]} · 거래소 주문 전 직접 확인 · 확정 수익 보장 아님`;
  }
  function changeStrategy(key){
    if(key===state.strategyMode||!TradeComparison.MODES.includes(key))return;
    state.strategyMode=key;try{localStorage.setItem('v325-strategy-mode',key);}catch(_){}
    state.seq++;state.strategyCandles=[];state.analysis=null;state.chartAnalysis=null;renderStrategyMode();renderDualCompare();loadDetail();
  }
  async function loadModeSnapshots(sym,seq,tf,ticker,chartCandles){
    const keys=TradeComparison.MODES;const opts={feeSide:state.fee,slipSide:state.slip,tickSize:state.instrumentTicks[sym],frames:state.frames};
    const next={};for(const key of keys){if(key===state.strategyMode&&state.strategyCandles.length&&state.analysis){next[key]={analysis:state.analysis,at:Date.now(),candles:state.strategyCandles};}}
    const others=keys.filter(key=>!next[key]);
    const tasks=others.map(async key=>{
      const anchor=TradeEngine.strategyConfig(key).anchor;
      const bars=anchor===tf?chartCandles:parseKlines((await api(`/v5/market/kline?category=linear&symbol=${encodeURIComponent(sym)}&interval=${anchor}&limit=240`)).list);
      if(bars.length<130)throw new Error('분석봉 부족');
      const ana=TradeEngine.analyze(bars,ticker,state.orderbook,state.oi,{...opts,strategyMode:key});
      return [key,{analysis:ana,at:Date.now(),candles:bars}];
    });
    const results=await Promise.allSettled(tasks);
    if(seq!==state.seq||sym!==state.symbol)return;
    for(const r of results){if(r.status==='fulfilled')next[r.value[0]]=r.value[1];}
    state.modeSnapshots=next;renderDualCompare();
  }
  function renderAnalysis(){const a=state.analysis;renderStrategyMode(a);renderDualCompare();if(!a){$('verdict').className='verdict wait';$('verdictText').textContent='WAIT';$('verdictReason').textContent=state.error?'데이터 확인 불가 · 신규 진입 보류':'실제 시장 데이터 분석 대기';planRender('LONG',null);planRender('SHORT',null);$('evidenceRows').replaceChildren(evidence('상태',state.error||'가격 데이터 대기','neutral'));TradeChart.setData([],null);renderEntryAlert();renderPosition();return;}
    const maxAllowed=state.instrumentMax[state.symbol];if(Number.isFinite(maxAllowed)&&maxAllowed>=1)state.leverage=Math.min(state.leverage,Math.floor(maxAllowed));
    const stale=Date.now()-state.lastAnalysis>75000||Date.now()-(state.selectedLastTick||state.lastMarket)>35000||state.error;const riskGate=checkTradeRisk(a,a.verdict);const verdict=stale||riskGate?'WAIT':a.verdict;
    $('verdict').className='verdict '+(verdict==='LONG'?'long':verdict==='SHORT'?'short':'wait');$('verdictText').textContent=verdict;
    $('verdictReason').textContent=stale?'시장 데이터 지연/오류 · 거래 신호 무효':riskGate||a.vreason;
    planRender('LONG',a.long);planRender('SHORT',a.short);renderDuration(a);renderLeverage();
    const x=(state.chartAnalysis||a).indicators;
    $('ema20Label').textContent=fmt(x.ema20);$('ema50Label').textContent=fmt(x.ema50);$('rsiLabel').textContent=x.rsi.toFixed(1);$('macdLabel').textContent=x.macd.toFixed(3);
    $('metricTrend').textContent=x.trend;$('metricTrend').className=x.trend==='상승 배열'?'positive':'negative';$('metricTrendDetail').textContent='EMA20 / EMA50';$('metricRsi').textContent=x.rsi.toFixed(1);$('metricRsiDetail').textContent=x.rsi>=70?'과매수 구간':x.rsi<=30?'과매도 구간':'중립 구간';$('metricAtr').textContent=fmt(x.atr);$('metricVolume').textContent=x.vr.toFixed(2)+'x';$('metricVolume').className=x.vr>=1.1?'positive':'';$('metricOi').textContent=x.oidelta===null?'미수신':pct(x.oidelta);$('metricFunding').textContent=x.funding===null?'미수신':(x.funding*100).toFixed(4)+'%';$('metricLevels').textContent=fmt(x.support)+' / '+fmt(x.resistance);
    $('chartStatus').textContent=`차트 ${state.interval}봉 · 추천선 ${a.strategy.title} 전략 · 마지막 완성봉`;$('evidenceTime').textContent=timeFmt(state.lastAnalysis);
    const sx=a.indicators;const rows=$('evidenceRows');rows.replaceChildren();rows.append(evidence('분석 전략',a.strategy.title+' · '+a.strategy.anchor+'봉','good'));rows.append(evidence('추세',sx.trend,sx.trend==='상승 배열'?'good':'bad'));rows.append(evidence('RSI',sx.rsi.toFixed(1)+' · 과매수/과매도 단독 진입 금지','neutral'));rows.append(evidence('MACD',`히스토그램 ${sx.macd.toFixed(4)}`,Math.abs(sx.macd)>0?'good':'neutral'));rows.append(evidence('거래량',`최근 완성봉 / 평균 ${sx.vr.toFixed(2)}배`,sx.vr>=1.1?'good':'neutral'));rows.append(evidence('호가',sx.imbalance===null?'수신 실패 · 진입 보류':`매수호가 ${(sx.imbalance*100).toFixed(1)}%`,sx.imbalance===null?'neutral':'good'));rows.append(evidence('OI 변화',sx.oidelta===null?'수신 실패':pct(sx.oidelta),'neutral'));rows.append(evidence('펀딩비',sx.funding===null?'수신 실패':(sx.funding*100).toFixed(4)+'%','neutral'));rows.append(evidence('지지/저항',`${fmt(sx.support)} / ${fmt(sx.resistance)}`,'good'));rows.append(evidence('진입 검증',verdict==='WAIT'?'가격대·수급·모멘텀 조건 확인 대기':`${verdict} 조건 일부 일치 · 직접 검토`,'neutral'));rows.append(evidence('상위 시간봉',a.strategy.higher.map(tf=>tf+':'+(a.frames?.[tf]?.trend||'미수신')).join(' / '),'neutral'));rows.append(evidence('TP 계산','고정 R배수 아님 · 피벗/거래량 근사/상위봉 · 목표별 이유 표시','good'));rows.append(evidence('뉴스','미연결 · 판단에 미반영','neutral'));
    TradeChart.setData(state.candles,a);renderEntryAlert();updatePositionMonitor();renderPosition();
  }
  function clearAnalysis(message){state.analysis=null;state.chartAnalysis=null;state.strategyCandles=[];state.error=message||'';state.lastAnalysis=0;renderAnalysis();}
  function selectSymbol(sym){if(sym===state.symbol&&state.candles.length)return;state.symbol=sym;state.seq++;state.candles=[];state.ticker=state.tickers.find(x=>x.symbol===sym)||null;state.selectedLastTick=state.lastMarket;state.orderbook=null;state.oi=null;state.frames={};state.strategyCandles=[];state.modeSnapshots={};state.chartAnalysis=null;state.frameUpdated=0;TradeChart.reset();clearAnalysis('');renderHeader();renderMarket();renderPosition();loadDetail();}
  async function loadUniverse(){try{const universe=new Set();let cursor='';for(let i=0;i<25;i++){const endpoint='/v5/market/instruments-info?category=linear&limit=1000'+(cursor?'&cursor='+encodeURIComponent(cursor):'');const res=await api(endpoint);for(const x of (res.list||[])){if(x.quoteCoin==='USDT'&&x.status==='Trading'&&x.contractType==='LinearPerpetual'){universe.add(x.symbol);state.instrumentTicks[x.symbol]=Number(x.priceFilter?.tickSize)||0;state.instrumentMax[x.symbol]=Number(x.leverageFilter?.maxLeverage)||null;}}cursor=res.nextPageCursor||'';if(!cursor)break;}if(universe.size>0){state.universe=universe;renderMarket();startStream([...universe]);renderLeverage();}}catch(err){console.warn('상품 목록 조회 실패: 실시간 티커의 USDT 종목으로 대체',err.message);}}
  async function loadMarket(){if(state.pollMarket)return;state.pollMarket=true;try{const res=await api('/v5/market/tickers?category=linear');if(!Array.isArray(res.list))throw new Error('전체 시세 목록 없음');state.tickers=res.list.filter(x=>/^[A-Z0-9]+USDT$/.test(x.symbol||'')&&Number.isFinite(Number(x.lastPrice))&&Number(x.lastPrice)>0).map(x=>({...x,...state.liveMap[x.symbol]}));state.lastMarket=Date.now();const t=state.tickers.find(x=>x.symbol===state.symbol);if(t){state.ticker=t;state.selectedLastTick=state.lastMarket;renderHeader();updatePositionMonitor();}
      renderMarket();if(!state.streamReady){setStatus(`Bybit REST 폴백 · ${state.tickers.length} 종목`,'warn');}$('lastUpdate').textContent='가격 '+timeFmt(state.lastMarket)+(state.streamReady?' · WebSocket 수신':' · REST 폴백');if(!state.stream&&state.tickers.length)startStream(state.tickers.map(x=>x.symbol));
    }catch(err){if(!state.streamReady)state.error='전체 시장 데이터 오류: '+err.message;setStatus('시장 데이터 오류','err');$('lastUpdate').textContent='마지막 업데이트 '+(state.lastMarket?timeFmt(state.lastMarket):'없음');if(!state.lastMarket)clearAnalysis(state.error);
    }finally{state.pollMarket=false;}}
  function parseKlines(rows){return (rows||[]).map(x=>({t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5]),turnover:Number(x[6])})).filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.c)).sort((a,b)=>a.t-b.t);}
  // WebSocket: selected price fast update / entire market visible figures / sorting throttled separately.
  let marketTimer=null,sortTimer=null,liveTimer=null,recheckTimer=0;
  function startStream(symbols){const clean=[...new Set(symbols)].filter(s=>/^[A-Z0-9]+USDT$/.test(s));if(!clean.length)return;
    if(state.stream)state.stream.stop(false);
    state.stream=new MarketStream.Client((row)=>{
      if(!state.enableRefresh)return;const old=state.liveMap[row.symbol]||{};
      state.liveMap[row.symbol]={...old,...row};state.lastMarket=Date.now();state.streamReady=true;
      const idx=state.tickers.findIndex(x=>x.symbol===row.symbol);
      if(idx>=0)Object.assign(state.tickers[idx],row);
      if(row.symbol===state.symbol){state.ticker={...(state.ticker||{}),...row};state.selectedLastTick=Date.now();
        if(!liveTimer){liveTimer=setTimeout(()=>{liveTimer=null;renderLivePrice(state.ticker);updatePositionMonitor();$('lastUpdate').textContent='실시간 '+timeFmt(state.lastMarket)+' · WS';},180);}
        if(state.analysis&&Date.now()-recheckTimer>7000){recheckTimer=Date.now();setTimeout(recheckPrice,150);}
      }
      state.dirtyMarket??=new Set();state.dirtyMarket.add(row.symbol);
      if(!marketTimer)marketTimer=setTimeout(flushMarket,250);
    },(status,ready,total)=>{state.streamStatus=status;
      if(status==='connected'){setStatus('Bybit WS · '+ready+'/'+total+' 연결','ok');}
      else if(!state.stream?.connected()){state.streamReady=false;setStatus('실시간 재연결 / REST 폴백','warn');}
    });state.stream.start(clean);
  }
  function flushMarket(){marketTimer=null;const dirty=state.dirtyMarket||new Set();state.dirtyMarket=new Set();const root=$('marketList');
    for(const symbol of dirty){const row=state.liveMap[symbol],el=root.querySelector(`[data-symbol="${symbol}"]`);if(!row||!el)continue;
      const price=Number(row.lastPrice),ch=Number(row.price24hPcnt)*100;
      if(Number.isFinite(price))el.querySelector('.market-price').textContent=fmt(price);
      if(Number.isFinite(ch)){const cell=el.querySelector('.market-change');cell.textContent=pct(ch);cell.className='market-change '+(ch>=0?'positive':'negative');}
    }
    if(!sortTimer)sortTimer=setTimeout(()=>{sortTimer=null;renderMarket();},3500);
  }
  async function fetchFrames(sym,seq,tf,currentCandles){
    const needed=['1','3','5','15','30','60','240','D','W'];const ready={};
    const fetched=await Promise.allSettled(needed.map(async interval=>{
      const bars=interval===tf?currentCandles:parseKlines((await api(`/v5/market/kline?category=linear&symbol=${encodeURIComponent(sym)}&interval=${interval}&limit=130`)).list);
      return [interval,TradeEngine.summarizeFrame(bars,interval)];
    }));
    if(seq!==state.seq)return null;
    for(const result of fetched){if(result.status==='fulfilled'&&result.value[1])ready[result.value[0]]=result.value[1];}
    state.frames=ready;state.frameUpdated=Date.now();return ready;
  }
  function renderDuration(a){const el=$('durationTypes');const plans=a?.duration?.plans||[];
    if(!plans.length){el.innerHTML='<span>초단기 --</span><span>당일 --</span><span>스윙 --</span>';$('durationReason').textContent='시간봉 분석 자료 대기';return;}
    el.replaceChildren();for(const x of plans){const span=document.createElement('span');span.className=(x.key===a.duration.preferred?'favoured ':'')+(x.side==='LONG'?'bullish':x.side==='SHORT'?'bearish':'');span.textContent=x.title+' '+x.side;span.title=x.reason;el.appendChild(span);}
    const preferred=plans.find(x=>x.key===a.duration.preferred);
    $('durationReason').textContent=preferred?`검토 우선: ${preferred.title} · ${preferred.hold} · ${preferred.reason} (보유기간 보장 아님)`:'시간봉 충돌/자료 부족 · 기간별 진입은 WAIT';
  }
  function checkTradeRisk(a,signal){
    if(!a||!['LONG','SHORT'].includes(signal))return '';
    const p=a[signal.toLowerCase()];const r=TradeEngine.leverageScenario(p,signal,{leverage:state.leverage,margin:state.margin,mode:state.marginMode,feeSide:state.fee,slipSide:state.slip,funding:a.indicators.funding});
    if(r.tooRisky)return '선택 배율에서 손절 전 청산 가능성 · 거래 부적합 WAIT';
    if(Number.isFinite(r.slPnl)&&-r.slPnl>state.lossBudget)return '선택 금액의 예상 손실이 허용 한도를 초과 · WAIT';
    return '';
  }
  function renderLeverage(){const levInput=$('leverageRange');if(!levInput)return;
    const max=state.instrumentMax[state.symbol];const effective=Number.isFinite(max)&&max>=1?Math.min(100,Math.floor(max)):100;
    state.leverage=Math.max(1,Math.min(effective,Math.round(state.leverage)));
    levInput.max=String(effective);levInput.value=String(state.leverage);const numInput=$('leverageNumber');numInput.max=String(effective);numInput.value=String(state.leverage);$('leverageDisplay').textContent=state.leverage+'x';
    $('maxLevLabel').textContent=Number.isFinite(max)?`종목 허용 상한 ${max}x`:'거래소 허용 상한 미확인';
    $('marginInput').value=String(state.margin);$('marginMode').value=state.marginMode;$('lossBudgetInput').value=String(state.lossBudget);
    const box=$('riskResults');box.replaceChildren();const a=state.analysis;
    if(!a){box.textContent='실제 분석 데이터 수신 대기';return;}
    const add=(name,value)=>{const d=document.createElement('div');d.className='risk-stat';const t=document.createElement('span');t.textContent=name;const b=document.createElement('strong');b.textContent=value;d.append(t,b);box.appendChild(d);};
    add('총 포지션 규모',TradeChart.format(state.margin*state.leverage)+' USDT');
    let severe=false,overBudget=false;
    for(const side of ['LONG','SHORT']){const p=a[side.toLowerCase()];const r=TradeEngine.leverageScenario(p,side,{leverage:state.leverage,margin:state.margin,mode:state.marginMode,feeSide:state.fee,slipSide:state.slip,funding:a.indicators.funding});
      const val=x=>Number.isFinite(x)?(x>=0?'+':'')+x.toFixed(2)+' USDT':'--';
      const roi=v=>Number.isFinite(v)?` (${v>=0?'+':''}${v.toFixed(1)}%)`:'';add(side+' TP1 예상 순손익',val(r.tp1Pnl)+roi(r.tp1Roi));add(side+' TP2 예상 순손익',val(r.tp2Pnl)+roi(r.tp2Roi));add(side+' SL 예상 순손익',val(r.slPnl)+roi(r.slRoi));
      if(r.tooRisky)severe=true;if(Number.isFinite(r.slPnl)&&-r.slPnl>state.lossBudget)overBudget=true;
    }
    const note=document.createElement('div');note.className='risk-warning';note.textContent=(severe?'고배율 경고: 손절 전에 청산될 수 있음. ':'')+(overBudget?'허용 손실 예산 초과 · 배율/증거금 축소 고려. ':'')+'실제 청산가는 계정 정보 없이 미산출.';box.appendChild(note);
    try{localStorage.setItem('v32-leverage',String(state.leverage));localStorage.setItem('v32-margin',String(state.margin));localStorage.setItem('v32-loss-budget',String(state.lossBudget));localStorage.setItem('v32-margin-mode',state.marginMode);}catch(_){}
  }
  async function recheckPrice(){if(!state.analysis||!state.enableRefresh)return;
    if(!state.candles.length||Date.now()-state.lastBook>65000||Date.now()-state.lastAnalysis>75000){$('verdictText').textContent='WAIT';$('verdictReason').textContent='수급 또는 분석 데이터 오래됨 · 재분석 대기';renderEntryAlert();renderPosition();return;}
    try{const current=state.ticker||state.tickers.find(x=>x.symbol===state.symbol);if(!current)return;
      const opts={feeSide:state.fee,slipSide:state.slip,tickSize:state.instrumentTicks[state.symbol],frames:state.frames,strategyMode:state.strategyMode};
      if(!state.strategyCandles.length)return;
      state.chartAnalysis=TradeEngine.analyze(state.candles,current,state.orderbook,state.oi,opts);
      state.analysis=TradeEngine.analyze(state.strategyCandles,current,state.orderbook,state.oi,opts);
      for(const [key,rec] of Object.entries(state.modeSnapshots)){if(!rec?.candles?.length||Date.now()-rec.at>75000)continue;try{rec.analysis=TradeEngine.analyze(rec.candles,current,state.orderbook,state.oi,{...opts,strategyMode:key});}catch(_){delete state.modeSnapshots[key];}}
      renderAnalysis();
    }catch(e){state.error='분석 재평가 실패 · '+e.message;clearAnalysis(state.error);}
  }
  async function loadOlder(oldest){if(!Number.isFinite(oldest)||oldest<=0)return [];
    const sym=state.symbol,tf=state.interval,seq=state.seq;
    const res=await api(`/v5/market/kline?category=linear&symbol=${encodeURIComponent(sym)}&interval=${tf}&end=${oldest-1}&limit=240`);
    if(sym!==state.symbol||tf!==state.interval||seq!==state.seq)return [];
    return parseKlines(res.list).filter(x=>x.t<oldest);
  }
  async function loadDetail(){if(state.pollDetail)return;state.pollDetail=true;const sym=state.symbol,tf=state.interval,seq=state.seq;
    setStatus('분석 데이터 갱신 중','warn');try{
      const [kl,ob,oi]=await Promise.allSettled([
        api(`/v5/market/kline?category=linear&symbol=${encodeURIComponent(sym)}&interval=${tf}&limit=240`),
        api(`/v5/market/orderbook?category=linear&symbol=${encodeURIComponent(sym)}&limit=50`),
        api(`/v5/market/open-interest?category=linear&symbol=${encodeURIComponent(sym)}&intervalTime=5min&limit=3`)
      ]);
      if(seq!==state.seq||sym!==state.symbol||tf!==state.interval)return;
      if(kl.status!=='fulfilled')throw kl.reason;
      const candles=parseKlines(kl.value.list);if(candles.length<130)throw new Error('충분한 캔들 데이터 없음');
      state.candles=candles;state.orderbook=ob.status==='fulfilled'?ob.value:null;state.oi=oi.status==='fulfilled'?oi.value.list:null;
      if(Date.now()-state.frameUpdated>120000||!Object.keys(state.frames).length)await fetchFrames(sym,seq,tf,candles);
      if(seq!==state.seq)return;
      const ticker=state.tickers.find(x=>x.symbol===sym)||state.ticker;
      if(!ticker)throw new Error('현재가 수신 전 · 분석 보류');
      state.ticker=ticker;state.lastBook=ob.status==='fulfilled'?Date.now():0;state.lastOi=oi.status==='fulfilled'?Date.now():0;
      const anchor=TradeEngine.strategyConfig(state.strategyMode).anchor;
      const strategyCandles=anchor===tf?candles:parseKlines((await api(`/v5/market/kline?category=linear&symbol=${encodeURIComponent(sym)}&interval=${anchor}&limit=240`)).list);
      if(seq!==state.seq||sym!==state.symbol)return;
      if(strategyCandles.length<130)throw new Error('선택 매매 관점의 시간봉 데이터 부족 · WAIT');
      const options={feeSide:state.fee,slipSide:state.slip,tickSize:state.instrumentTicks[sym],frames:state.frames,strategyMode:state.strategyMode};
      state.strategyCandles=strategyCandles;
      state.chartAnalysis=TradeEngine.analyze(candles,ticker,state.orderbook,state.oi,options);
      state.analysis=TradeEngine.analyze(strategyCandles,ticker,state.orderbook,state.oi,options);
      state.lastAnalysis=Date.now();state.error='';state.modeSnapshots[state.strategyMode]={analysis:state.analysis,at:state.lastAnalysis,candles:strategyCandles};renderHeader();renderAnalysis();
      // 배경 요약은 실제 각 모드 240개 캔들로 별도 계산. 실패 모드는 WAIT.
      loadModeSnapshots(sym,seq,tf,ticker,candles).catch(()=>{});setStatus('Bybit 공개 API · 분석 갱신',state.streamReady?'ok':'warn');$('lastUpdate').textContent='분석 '+timeFmt(state.lastAnalysis)+(state.streamReady?' · 시세 WS':' · REST 폴백');
      // Candidate-price arrival alone is NOT a confirmed signal or an audible alert.
    }catch(err){if(seq===state.seq){state.error='분석 중단: '+(err?.message||String(err));setStatus('분석 오류 / WAIT','err');clearAnalysis(state.error);}}
    finally{state.pollDetail=false;if(seq!==state.seq)queueMicrotask(loadDetail);}}
  function setSort(s){state.sort=s;$('marketList').scrollTop=0;renderMarket();$('sortChange').classList.toggle('sort-active',s.startsWith('change'));$('sortPrice').classList.toggle('sort-active',s.startsWith('price'));}
  function detailDialog(page){const a=state.analysis;const detail={
      analysis:['AI 종합 판단 · 상세 분석',a?`<h3>${a.strategy.title} (${a.strategy.anchor}봉 기준) 종합 판단: ${a.verdict}</h3><p>${a.vreason}</p><p>이 판단은 학습형 예측 AI가 아닌 <b>규칙 기반 정량 점수 모델</b>입니다. 승률 또는 진입 성공 확률이 아닙니다.</p><h3>LONG 후보</h3><p>진입 ${fmt(a.long.entry)} · TP1 ${fmt(a.long.tp1)} · TP2 ${fmt(a.long.tp2)} · SL ${fmt(a.long.stop)} · 순비용 반영 TP1 손익비 1:${a.long.rr.toFixed(2)}</p><p>TP1 근거: ${a.long.tp1Reason}<br>TP2 근거: ${a.long.tp2Reason}</p><p>판정 ${a.long.state}<br>조건 충족률 ${a.long.score}% / 진입 보류 근거: ${a.long.failed.join(', ')||'현재 조건 충족'}</p><h3>SHORT 후보</h3><p>진입 ${fmt(a.short.entry)} · TP1 ${fmt(a.short.tp1)} · TP2 ${fmt(a.short.tp2)} · SL ${fmt(a.short.stop)} · 순비용 반영 TP1 손익비 1:${a.short.rr.toFixed(2)}</p><p>TP1 근거: ${a.short.tp1Reason}<br>TP2 근거: ${a.short.tp2Reason}</p><p>판정 ${a.short.state}<br>조건 충족률 ${a.short.score}% / 진입 보류 근거: ${a.short.failed.join(', ')||'현재 조건 충족'}</p><h3>핵심 계산</h3><p>EMA20/50/200, RSI14, MACD, 최근 완성봉 거래량, 피벗·피보나치, ATR14, 호가 불균형, OI 및 펀딩비의 공개 API를 결합합니다. 데이터가 부족할 때는 WAIT.</p>`:'<p>데이터가 없어서 분석할 수 없습니다. Bybit 공개 API 연결을 확인하세요.</p>'],
      market:['시장지표',a?`<h3>${state.symbol} 지표</h3><p>EMA20 ${fmt(a.indicators.ema20)} / EMA50 ${fmt(a.indicators.ema50)} / EMA200 ${fmt(a.indicators.ema200)}</p><p>RSI14 ${a.indicators.rsi.toFixed(1)} / ATR14 ${fmt(a.indicators.atr)} / MACD 히스토그램 ${a.indicators.macd.toFixed(4)}</p><p>호가 매수 비중 ${a.indicators.imbalance===null?'미수신':(a.indicators.imbalance*100).toFixed(1)+'%'} / OI 변화 ${a.indicators.oidelta===null?'미수신':pct(a.indicators.oidelta)} / 펀딩비 ${a.indicators.funding===null?'미수신':(a.indicators.funding*100).toFixed(4)+'%'}</p><p>전체 시장은 왼쪽에서 상승순·하락순·거래대금순으로 정렬할 수 있습니다.</p>`:'<p>먼저 API 데이터를 수신해야 합니다.</p>'],
      backtest:['백테스트 / 성과 검증','<h3>아직 구현되지 않았습니다</h3><p>백테스트 성과나 검증된 승률을 제공하는 것처럼 표시하지 않습니다. 실전 매매에 사용하기 전에 매수·매도 신호를 기록하고, 수수료와 슬리피지 및 봉 단위 체결 제약을 반영한 워크포워드 검증이 필요합니다.</p>'],
      paper:['모의매매','<h3>모의매매 실행 기능은 아직 없습니다</h3><p>실제 주문 기능도 없으며 API 키를 사용하지 않습니다. 현재는 공개 시세에 따른 전략 <b>후보 계산 및 조건부 진입 신호</b>만 수행합니다.</p>'],
      alerts:['진입·청산 알림','<h3>AI TRADE ALERT · AI POSITION MANAGER</h3><p>완성봉/호가/수급/손익비와 사용자 배율 조건을 확인한 신호는 오른쪽 AI 패널에서 강조합니다. 수동 포지션 등록 후 보유·분할 익절·종료 검토도 표시합니다.</p><p>이 앱에는 실제 주문·체결 확인·백그라운드 푸시가 없습니다. 신호는 화면이 열려 있을 때만 갱신되고, WAIT에서 확인된 LONG/SHORT로 전환될 때만 (동일 방향 2분 재알림 제한) 메시지와 선택형 소리를 재생합니다. 소리는 사용자 버튼 조작 후 켜지며, 백그라운드에서는 작동하지 않습니다. 점멸은 패널 버튼으로 끌 수 있습니다.</p>'],
      settings:['분석 설정',`<h3>추정 비용</h3><p>진입·청산 양쪽의 비용을 손익비에 반영합니다. 실제 계정 수수료와 시장 충격에 따라 다릅니다.</p><label>편도 수수료 (%) <input id="feeInput" type="number" step="0.01" min="0" max="1" value="${(state.fee*100).toFixed(3)}" style="background:#18364c;color:#fff;width:85px;border:1px solid #486c8b;padding:6px"></label><p><label>편도 예상 슬리피지 (%) <input id="slipInput" type="number" step="0.01" min="0" max="1" value="${(state.slip*100).toFixed(3)}" style="background:#18364c;color:#fff;width:85px;border:1px solid #486c8b;padding:6px"></label></p><button id="saveSettings" style="background:#ab7920;color:#fff;padding:8px 18px;border-radius:6px">설정 적용</button><h3>데이터 출처</h3><p>Bybit V5 공개시장 WebSocket 시세 · REST 폴백. 분석은 45초 주기. API 접속 불가시 신호는 WAIT.</p>`]
    };
    const [title,body]=detail[page]||detail.analysis;$('dialogTitle').textContent=title;$('dialogBody').innerHTML=body;$('overlay').classList.remove('hidden');const save=$('saveSettings');if(save)save.onclick=()=>{const fee=Math.max(0,Math.min(.01,Number($('feeInput').value)/100));const slip=Math.max(0,Math.min(.01,Number($('slipInput').value)/100));if(!Number.isFinite(fee)||!Number.isFinite(slip)){toast('숫자를 확인하세요');return;}state.fee=fee;state.slip=slip;try{localStorage.setItem('v32-fee',String(fee));localStorage.setItem('v32-slip',String(slip));}catch(_){}closeOverlay();loadDetail();toast('설정 적용 완료');};
  }
  function closeOverlay(){const wasOpen=!$('overlay').classList.contains('hidden');$('overlay').classList.add('hidden');document.querySelectorAll('.navitem').forEach(x=>x.classList.toggle('active',x.dataset.page==='home'));return wasOpen;}
  window.closeOverlay=closeOverlay;
  function bind(){TradeChart.bind();TradeChart.setHistoryLoader(loadOlder);
    document.querySelectorAll('[data-strategy]').forEach(b=>b.addEventListener('click',()=>changeStrategy(b.dataset.strategy)));
    $('positionFormToggle').addEventListener('click',beginPositionForm);
    $('positionSide').addEventListener('change',()=>{const p=state.analysis?.[$('positionSide').value.toLowerCase()];const price=Number($('positionEntry').value);$('positionStop').value=Number.isFinite(p?.stop)&&Number.isFinite(price)&&($('positionSide').value==='LONG'?p.stop<price:p.stop>price)?p.stop:'';});
    $('positionSave').addEventListener('click',saveManualPosition);
    $('positionRemaining').addEventListener('change',e=>{if(!activePosition)return;activePosition.remainingPct=Number(e.target.value);storePosition();renderPosition();toast('남은 비율 기록 변경 · 실제 거래소 주문과 무관');});
    $('positionStopTrack').addEventListener('click',()=>{if(!activePosition)return;if(!window.confirm('이 앱의 수동 추적 기록을 종료할까요? 거래소 포지션을 청산하지는 않습니다.'))return;activePosition=null;storePosition();renderEntryAlert();renderPosition();});
    $('alertSoundToggle').addEventListener('click',enableSoundFromTap);soundToggleUI();
    $('alertBlinkToggle').addEventListener('click',()=>{blinkEnabled=!blinkEnabled;try{localStorage.setItem('v324-blink',blinkEnabled?'on':'off');}catch(_){}renderEntryAlert();});
$('leverageRange').addEventListener('input',e=>{state.leverage=Number(e.target.value);if(state.analysis)renderAnalysis();else renderLeverage();});
    $('leverageNumber').addEventListener('change',e=>{const raw=Number(e.target.value);const max=state.instrumentMax[state.symbol];const cap=Number.isFinite(max)&&max>=1?Math.min(100,Math.floor(max)):100;state.leverage=Number.isFinite(raw)&&raw>=1?Math.max(1,Math.min(cap,Math.round(raw))):state.leverage;if(state.analysis)renderAnalysis();else renderLeverage();});
    $('leverageNumber').addEventListener('keydown',e=>{if(e.key==='Enter'){e.currentTarget.blur();}});$('marginInput').addEventListener('change',e=>{state.margin=Math.max(1,Number(e.target.value)||100);if(state.analysis)renderAnalysis();else renderLeverage();});$('marginMode').addEventListener('change',e=>{state.marginMode=e.target.value;if(state.analysis)renderAnalysis();else renderLeverage();});$('lossBudgetInput').addEventListener('change',e=>{state.lossBudget=Math.max(1,Number(e.target.value)||10);if(state.analysis)renderAnalysis();else renderLeverage();});$('searchSymbol').addEventListener('input',e=>{state.filter=e.target.value.trim();$('marketList').scrollTop=0;renderMarket();});$('clearSearch').addEventListener('click',()=>{$('searchSymbol').value='';state.filter='';renderMarket();});$('allTab').addEventListener('click',()=>{state.favsOnly=false;renderMarket();});$('favTab').addEventListener('click',()=>{state.favsOnly=true;renderMarket();});document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>setSort(b.dataset.sort)));$('sortChange').addEventListener('click',()=>setSort(state.sort==='change-desc'?'change-asc':'change-desc'));$('sortPrice').addEventListener('click',()=>setSort(state.sort==='price-desc'?'price-asc':'price-desc'));$('marketReload').addEventListener('click',()=>{loadMarket();loadDetail();});$('heroFav').addEventListener('click',()=>toggleFav(state.symbol));document.querySelectorAll('[data-tf]').forEach(b=>b.addEventListener('click',()=>{state.interval=b.dataset.tf;state.seq++;document.querySelectorAll('[data-tf]').forEach(x=>x.classList.toggle('selected',x===b));TradeChart.reset();clearAnalysis('');loadDetail();}));document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>{const page=b.dataset.page;if(page==='home'){closeOverlay();return;}detailDialog(page);}));$('dialogClose').addEventListener('click',closeOverlay);$('overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeOverlay();});$('fullscreenBtn').addEventListener('click',()=>{if(window.AndroidBridge){toast('태블릿에서는 전체 화면으로 실행됩니다.');return;}if(!document.fullscreenElement){document.documentElement.requestFullscreen?.().catch(()=>{});}else{document.exitFullscreen?.();}});
    window.addEventListener('visibilitychange',()=>{state.enableRefresh=!document.hidden;if(document.hidden){state.stream?.stop();SignalAlerts.observe(state.symbol+'|'+state.strategyMode,'WAIT');}else{startStream([...(state.universe||new Set(state.tickers.map(x=>x.symbol)))]);loadMarket();loadDetail();}});
    setInterval(()=>{if(!state.enableRefresh)return;if(!state.stream?.connected()||Date.now()-(state.selectedLastTick||state.lastMarket)>25000){state.streamReady=!!state.stream?.connected();loadMarket();}},15000);
    setInterval(()=>{if(!state.enableRefresh)return;loadMarket();},60000);
    setInterval(()=>{if(!state.enableRefresh)return;loadDetail();},45000);
    setInterval(()=>{if(state.lastAnalysis&&(Date.now()-state.lastAnalysis>75000||Date.now()-(state.selectedLastTick||state.lastMarket)>35000)){state.error='데이터 갱신 중단 · WAIT';setStatus('시세 지연 / WAIT','err');$('verdict').className='verdict wait';$('verdictText').textContent='WAIT';$('verdictReason').textContent='시세 또는 분석 갱신 지연 · 신호 비활성화';renderEntryAlert();renderPosition();}},5000);
  }
  function init(){bind();renderMarket();renderHeader();renderLeverage();renderEntryAlert();renderPosition();loadMarket().then(()=>loadDetail());loadUniverse();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  if(typeof module!=='undefined'&&module.exports)module.exports={parseKlines};
})();
