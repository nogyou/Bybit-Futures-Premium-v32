'use strict';
const TradeChart = (()=>{
  const colors={bg:'#04111d',grid:'#1a3146',green:'#17df97',red:'#ff5a78',blue:'#488aff',gold:'#f3ac23',purple:'#b879ff',white:'#e8f5ff',muted:'#93acc1'};
  let candles=[],analysis=null,zoom=82,offset=0,overlay=true,emaOn=true,group='ALL',hover=-1,loading=false,hasMore=true,historyLoader=null,seriesCache=null;
  let priceProbeY=null,priceView=null;
  const $=id=>document.getElementById(id);
  const format=v=>{if(!Number.isFinite(v))return '--';const d=v>=100?2:v>=1?4:v>=.01?5:v>=.0001?7:10;return v.toLocaleString('en-US',{minimumFractionDigits:Math.min(2,d),maximumFractionDigits:d});};
  function prepare(id){const el=$(id);if(!el)return null;const rect=el.getBoundingClientRect();if(rect.width<20||rect.height<20)return null;const dpr=Math.min(2,window.devicePixelRatio||1);el.width=Math.round(rect.width*dpr);el.height=Math.round(rect.height*dpr);const c=el.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);return {c,w:rect.width,h:rect.height};}
  function stroke(c,col,width=1,dash=[]){c.strokeStyle=col;c.lineWidth=width;c.setLineDash(dash);}
  function label(c,s,x,y,color=colors.muted,size=10,align='left',bold=false){c.font=`${bold?'700':'500'} ${size}px system-ui,sans-serif`;c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.fillText(s,x,y);}
  function poly(c,pts,color,width){stroke(c,color,width);c.beginPath();let fresh=true;for(const p of pts){if(!p||!Number.isFinite(p[1])){fresh=true;continue;}if(fresh){c.moveTo(p[0],p[1]);fresh=false;}else c.lineTo(p[0],p[1]);}c.stroke();}
  const closed=()=>candles.length>1?candles.slice(0,-1):[];
  function getWindow(){const all=closed();const end=Math.max(0,all.length-offset),start=Math.max(0,end-zoom);return {data:all.slice(start,end),start,end,total:all.length};}
  function updateStatus(){const status=$('chartHistoryStatus');if(status)status.textContent=loading?'과거 데이터 추가 조회 중…':offset?'과거 차트 탐색 중 · ◉ 최신으로 복귀':'차트 드래그: 이전 날짜 탐색';}
  function calcSeries(){const bars=closed();if(bars.length<55){seriesCache=null;return;}const prices=bars.map(b=>b.c),m=TradeEngine.macd(prices);seriesCache={ema20:TradeEngine.ema(prices,20),ema50:TradeEngine.ema(prices,50),rsi:TradeEngine.rsi(prices),macd:m.hist,macdLine:m.line,macdSignal:m.sig};}
  // One entry zone and one exit zone per direction on the chart.
  // The entry interval is a narrow visualization band around the actual entry candidate,
  // NOT a newly validated entry range. The exit band spans independently derived
  // structural TP1/TP2; insufficient structural targets do not create a fake exit band.
  function levels(){if(!analysis||!overlay)return [];
    const make=(side,p)=>{
      if(!p||!Number.isFinite(p.entry))return [];
      const long=side==='LONG', col=long?colors.green:colors.red;
      const risk=Number.isFinite(p.risk)&&p.risk>0?p.risk:Math.abs((p.entry||0)-(p.stop||p.entry));
      const tick=Math.max(Math.abs(p.entry)*.000015,0.00000001);
      const width=Math.max(tick,Math.min(risk*.10,Math.abs(p.entry)*.00045));
      const entry={kind:side,name:'진입 구간',lo:p.entry-width,hi:p.entry+width,center:p.entry,col};
      const result=[entry];
      if(Number.isFinite(p.tp1)&&Number.isFinite(p.tp2)&&
         (long?p.tp1>p.entry&&p.tp2>=p.tp1:p.tp1<p.entry&&p.tp2<=p.tp1)){
        result.push({kind:side,name:'익절 구간',lo:Math.min(p.tp1,p.tp2),hi:Math.max(p.tp1,p.tp2),center:p.tp1,col});
      }
      return result;
    };
    return [...(group==='SHORT'?[]:make('LONG',analysis.long)),...(group==='LONG'?[]:make('SHORT',analysis.short))];
  }
  function axisBadge(c,{w,right,top,ch,y,text,fill,ink='#061522',outline,shift=0}){
    const yy=Math.max(top+8,Math.min(top+ch-8,y+shift)),width=Math.min(right-12,80),height=15,x=w-right+4;
    c.fillStyle=fill;c.fillRect(x,yy-height/2,width,height);
    if(outline){stroke(c,outline,.8);c.strokeRect(x+.5,yy-height/2+.5,width-1,height-1);}
    label(c,text,x+4,yy,ink,9,'left',true);
    return yy;
  }
  function drawPrice(){const r=prepare('priceChart');if(!r)return;const {c,w,h}=r;c.fillStyle=colors.bg;c.fillRect(0,0,w,h);
    const {data,start,end,total}=getWindow();if(data.length<3){label(c,'Bybit 실제 캔들 데이터 수신 대기',w/2,h/2,colors.muted,13,'center');return;}
    const left=9,right=Math.min(138,Math.max(104,w*.24)),top=29,bottom=23,volumeH=Math.max(28,Math.min(51,h*.17));const pw=w-left-right,ch=h-top-bottom-volumeH;
    if(pw<30||ch<15)return;const plots=levels();const current=analysis?.livePrice??data.at(-1).c;
    let lo=Math.min(...data.map(x=>x.l)),hi=Math.max(...data.map(x=>x.h));const candleSpread=Math.max((hi-lo),current*.0006);
    // Keep the user's 82-bar candles readable when longer-horizon target lines are off screen.
    // Out-of-range levels remain visible numerically in the AI plan card, but do not
    // expand the chart's price scale or draw misleading clamped labels.
    const margin=Math.max(candleSpread*.35,current*.0015);
    const displayedPlots=plots.filter(level=>level.hi>=lo-margin&&level.lo<=hi+margin);
    // A large TP1-to-TP2 band must not shrink the visible candles.
    // Show only the visible slice of each band, without expanding the Y-axis to distant targets.
    if(offset===0){lo=Math.min(lo,current);hi=Math.max(hi,current);}const pad=Math.max((hi-lo)*.09,current*.0002);lo-=pad;hi+=pad;
    const yy=v=>top+(hi-v)/(hi-lo)*ch,step=pw/data.length,xx=i=>left+(i+.5)*step;
    priceView={lo,hi,top,ch,w,right,left,pw};
    const probePrice=priceProbeY===null?null:hi-(Math.max(top,Math.min(top+ch,priceProbeY))-top)/ch*(hi-lo);
    const probeY=priceProbeY===null?null:Math.max(top,Math.min(top+ch,priceProbeY));
    const currentY=offset===0&&Number.isFinite(current)?yy(current):null;
    for(let i=0;i<=5;i++){const y=top+ch*i/5;stroke(c,colors.grid,.7,[3,4]);c.beginPath();c.moveTo(left,y);c.lineTo(w-right+4,y);c.stroke();if((currentY===null||Math.abs(y-currentY)>14)&&(probeY===null||Math.abs(y-probeY)>14))label(c,format(hi-(hi-lo)*i/5),w-right+7,y,colors.muted,9);}
    for(let i=0;i<=6;i++){const x=left+pw*i/6;stroke(c,colors.grid,.5,[2,4]);c.beginPath();c.moveTo(x,top);c.lineTo(x,h-bottom);c.stroke();}
    const vMax=Math.max(1,...data.map(x=>x.v)),volBottom=top+ch+volumeH;
    data.forEach((p,i)=>{const x=xx(i),width=Math.max(1.5,Math.min(16,step*.67)),col=p.c>=p.o?colors.green:colors.red;stroke(c,col,1);c.beginPath();c.moveTo(x,yy(p.h));c.lineTo(x,yy(p.l));c.stroke();c.fillStyle=col;c.fillRect(x-width/2,Math.min(yy(p.o),yy(p.c)),width,Math.max(1,Math.abs(yy(p.c)-yy(p.o))));c.globalAlpha=.65;const vheight=Math.max(1,p.v/vMax*(volumeH-4));c.fillRect(x-width/2,volBottom-vheight,width,vheight);c.globalAlpha=1;});
    if(seriesCache&&emaOn){for(const [key,col] of [['ema20',colors.blue],['ema50',colors.gold]]){const seq=seriesCache[key];poly(c,data.map((_,i)=>[xx(i),Number.isFinite(seq[start+i])?yy(seq[start+i]):NaN]),col,1.8);}}
    // Entry/exit ranges use thin dashed bounds and a translucent band.
    // Compact tags stay LEFT of the candle region: the right gutter is reserved for prices.
    const drawn=displayedPlots.map(p=>({...p,y:yy(p.center)})).sort((a,b)=>a.y-b.y);
    const minLabel=top+9,maxLabel=top+ch-9;
    const labelGap=drawn.length>1?Math.min(18,(maxLabel-minLabel)/(drawn.length-1)):0;
    drawn.forEach(p=>{
      const a=Math.max(top,Math.min(top+ch,yy(p.hi))),b=Math.max(top,Math.min(top+ch,yy(p.lo)));
      if(b>=a){c.globalAlpha=.085;c.fillStyle=p.col;c.fillRect(left,a,pw,b-a);c.globalAlpha=1;}
      for(const y of [a,b]){stroke(c,p.col,1,[5,4]);c.beginPath();c.moveTo(left,y);c.lineTo(w-right,y);c.stroke();}
    });
    const positions=drawn.map(p=>Math.max(minLabel,Math.min(maxLabel,p.y)));
    for(let i=1;i<positions.length;i++)positions[i]=Math.max(positions[i],positions[i-1]+labelGap);
    if(positions.length&&positions.at(-1)>maxLabel){const excess=positions.at(-1)-maxLabel;for(let i=0;i<positions.length;i++)positions[i]-=excess;}
    if(positions.length&&positions[0]<minLabel){const shift=minLabel-positions[0];for(let i=0;i<positions.length;i++)positions[i]+=shift;}
    drawn.forEach((p,i)=>{
      const tagY=positions[i],badgeX=left+3,badgeW=65,badgeH=13;
      c.fillStyle=p.kind==='LONG'?'#0b493b':'#562638';c.fillRect(badgeX,tagY-badgeH/2,badgeW,badgeH);
      label(c,(p.kind==='LONG'?'L':'S')+' '+p.name,badgeX+3,tagY,p.col,8,'left',true);
    });
    // The live market price is a solid horizontal line, not a dashed overlay label.
    if(currentY!==null&&currentY>=top&&currentY<=top+ch){
      stroke(c,'#ffcb41',1.1);c.beginPath();c.moveTo(left,currentY);c.lineTo(w-right,currentY);c.stroke();
    }
    // The touch/mouse inspection line is horizontal only, no vertical crosshair.
    if(probeY!==null){stroke(c,'#e2e8f0',1.0);c.beginPath();c.moveTo(left,probeY);c.lineTo(w-right,probeY);c.stroke();}
    // Distinct, small price tags entirely in the right-hand axis gutter.
    // If tags approach each other, move only the inspection badge, never the actual price line.
    if(currentY!==null&&currentY>=top&&currentY<=top+ch){
      axisBadge(c,{w,right,top,ch,y:currentY,text:format(current),fill:'#ffcb41'});
    }
    if(probeY!==null&&Number.isFinite(probePrice)){
      const shift=currentY!==null&&Math.abs(probeY-currentY)<18?(probeY<=currentY?-19:19):0;
      const yyBadge=axisBadge(c,{w,right,top,ch,y:probeY,shift,text:format(probePrice),fill:'#33465c',ink:'#ffffff',outline:'#b5cce5'});
      if(shift){stroke(c,'#b5cce5',.7);c.beginPath();c.moveTo(w-right,probeY);c.lineTo(w-right+3,yyBadge);c.stroke();}
    }
    for(let i=0;i<=5;i++){const j=Math.min(data.length-1,Math.floor((data.length-1)*i/5)),d=new Date(data[j].t);label(c,d.toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}),xx(j),h-9,colors.muted,9,'center');}
    if(hover>=0&&hover<data.length){const x=xx(hover),bar=data[hover];const tip=$('chartTooltip');tip.style.display='block';tip.style.left=Math.min(w-195,Math.max(4,x+9))+'px';tip.style.top='39px';tip.textContent=`${new Date(bar.t).toLocaleString('ko-KR')} O ${format(bar.o)} H ${format(bar.h)} L ${format(bar.l)} C ${format(bar.c)}`;}else $('chartTooltip').style.display='none';
  }
  function osc(id,kind){const r=prepare(id);if(!r)return;const {c,w,h}=r;c.fillStyle='#06101d';c.fillRect(0,0,w,h);const {data,start}=getWindow();if(data.length<3||!seriesCache)return;
    const l=9,rt=Math.min(138,Math.max(104,w*.24)),pw=w-l-rt,xx=i=>l+pw*(i+.5)/data.length;
    if(kind==='rsi'){const yy=v=>5+(100-v)*(h-11)/100;for(const z of [30,50,70]){stroke(c,colors.grid,.7,[3,4]);c.beginPath();c.moveTo(l,yy(z));c.lineTo(w-rt,yy(z));c.stroke();label(c,String(z),w-rt+5,yy(z),colors.muted,9);}poly(c,data.map((_,i)=>[xx(i),Number.isFinite(seriesCache.rsi[start+i])?yy(seriesCache.rsi[start+i]):NaN]),colors.purple,1.8);}
    else {const seq=seriesCache;const values=[...seq.macd.slice(start,start+data.length),...seq.macdLine.slice(start,start+data.length),...seq.macdSignal.slice(start,start+data.length)].filter(Number.isFinite);if(!values.length)return;const max=Math.max(1e-8,...values.map(Math.abs))*1.25,ym=v=>h/2-v/max*(h-10)/2;
      stroke(c,colors.grid,.8);c.beginPath();c.moveTo(l,h/2);c.lineTo(w-rt,h/2);c.stroke();const bw=Math.max(1,pw/data.length*.65);data.forEach((_,i)=>{const v=seq.macd[start+i];if(!Number.isFinite(v))return;c.fillStyle=v>=0?colors.green:colors.red;c.fillRect(xx(i)-bw/2,Math.min(h/2,ym(v)),bw,Math.max(1,Math.abs(h/2-ym(v))));});
      poly(c,data.map((_,i)=>[xx(i),Number.isFinite(seq.macdLine[start+i])?ym(seq.macdLine[start+i]):NaN]),colors.blue,1.3);
      poly(c,data.map((_,i)=>[xx(i),Number.isFinite(seq.macdSignal[start+i])?ym(seq.macdSignal[start+i]):NaN]),colors.gold,1.3);}
  }
  function draw(){updateStatus();drawPrice();osc('rsiChart','rsi');osc('macdChart','macd');}
  function maxOffset(){return Math.max(0,closed().length-Math.min(24,zoom));}
  function maybeOlder(){if(!historyLoader||loading||!hasMore)return;const all=closed();if(offset+zoom<all.length-20)return;loading=true;draw();const oldest=all[0]?.t;
    Promise.resolve().then(()=>historyLoader(oldest)).then(rows=>{if(!Array.isArray(rows)||!rows.length){hasMore=false;return;}
      const unique=new Map([...rows,...candles].map(b=>[b.t,b]));candles=[...unique.values()].sort((a,b)=>a.t-b.t);calcSeries();if(rows.length<8)hasMore=false;
    }).catch(e=>{console.warn('과거 캔들 조회 실패',e.message);hasMore=false;}).finally(()=>{loading=false;draw();});
  }
  function panBy(deltaBars){offset=Math.max(0,Math.min(maxOffset(),offset+deltaBars));hover=-1;draw();maybeOlder();}
  function bind(){window.addEventListener('resize',draw);window.addEventListener('orientationchange',()=>setTimeout(draw,150));
    $('zoomIn').addEventListener('click',()=>{zoom=Math.max(26,zoom-15);draw();});$('zoomOut').addEventListener('click',()=>{zoom=Math.min(220,zoom+15);draw();maybeOlder();});$('fitChart').addEventListener('click',()=>{zoom=110;offset=0;draw();});$('liveChart').addEventListener('click',()=>{offset=0;draw();});
    $('overlayBtn').addEventListener('click',e=>{overlay=!overlay;e.currentTarget.classList.toggle('tool-selected',overlay);e.currentTarget.textContent='AI 가격선 '+(overlay?'ON':'OFF');draw();});
    $('lineMode').addEventListener('click',e=>{group=group==='ALL'?'LONG':group==='LONG'?'SHORT':'ALL';e.currentTarget.textContent=group==='ALL'?'전체선 ▼':group+'만 ▼';draw();});
    $('emaBtn').addEventListener('click',e=>{emaOn=!emaOn;e.currentTarget.classList.toggle('tool-selected',emaOn);draw();});
    const canvas=$('priceChart');canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.shiftKey){panBy(Math.round(e.deltaY/18));return;}zoom=Math.max(26,Math.min(220,zoom+(e.deltaY>0?12:-12)));draw();maybeOlder();},{passive:false});
    let startX=0,lastX=0,pinchDistance=0,dragging=false,touched=false,inspect=false,longPressTimer=null,startY=0;
    canvas.addEventListener('touchstart',e=>{touched=true;dragging=false;inspect=false;lastX=e.touches[0].clientX;startX=lastX;startY=e.touches[0].clientY;clearTimeout(longPressTimer);if(e.touches.length===2){pinchDistance=Math.abs(e.touches[0].clientX-e.touches[1].clientX);priceProbeY=null;}else{longPressTimer=setTimeout(()=>{inspect=true;priceProbeY=startY-canvas.getBoundingClientRect().top;drawPrice();},330);}},{passive:true});
    canvas.addEventListener('touchmove',e=>{e.preventDefault();if(inspect&&e.touches.length===1){priceProbeY=e.touches[0].clientY-canvas.getBoundingClientRect().top;drawPrice();return;}if(e.touches.length===2){clearTimeout(longPressTimer);priceProbeY=null;const span=Math.abs(e.touches[0].clientX-e.touches[1].clientX);if(Math.abs(span-pinchDistance)>9){zoom=Math.max(26,Math.min(220,zoom+(span>pinchDistance?-7:7)));pinchDistance=span;draw();}return;}
      if(e.touches.length!==1)return;const x=e.touches[0].clientX;if(Math.hypot(x-startX,e.touches[0].clientY-startY)>9)clearTimeout(longPressTimer);const step=Math.max(2,(canvas.getBoundingClientRect().width-120)/zoom);const bars=Math.trunc((x-lastX)/step);if(bars!==0){panBy(bars);lastX=x;dragging=true;}
    },{passive:false});canvas.addEventListener('touchend',()=>{clearTimeout(longPressTimer);pinchDistance=0;inspect=false;priceProbeY=null;drawPrice();setTimeout(()=>{touched=false;},250);},{passive:true});
    canvas.addEventListener('touchcancel',()=>{clearTimeout(longPressTimer);inspect=false;priceProbeY=null;drawPrice();});
    canvas.addEventListener('mousedown',e=>{if(e.button!==0)return;dragging=true;startX=e.clientX;lastX=e.clientX;});
    window.addEventListener('mouseup',()=>{dragging=false;});
    canvas.addEventListener('mousemove',e=>{if(touched)return;const bounds=canvas.getBoundingClientRect();if(dragging){const step=Math.max(2,(bounds.width-120)/zoom),bars=Math.trunc((e.clientX-lastX)/step);if(bars){panBy(bars);lastX=e.clientX;}return;}
      const {data}=getWindow();hover=Math.max(0,Math.min(data.length-1,Math.floor((e.clientX-bounds.left-9)/(bounds.width-Math.min(138,Math.max(104,bounds.width*.24))-9)*data.length)));if(priceView)priceProbeY=Math.max(priceView.top,Math.min(priceView.top+priceView.ch,e.clientY-bounds.top));drawPrice();});
    canvas.addEventListener('mouseleave',()=>{hover=-1;priceProbeY=null;drawPrice();});
  }
  function setData(next,a){const prior=candles;if(next.length&&prior.length&&prior[0].t<next[0].t&&prior.at(-1).t<=next.at(-1).t){const merged=new Map([...prior,...next].map(b=>[b.t,b]));candles=[...merged.values()].sort((x,y)=>x.t-y.t);}else{candles=next;}
    analysis=a;hover=-1;calcSeries();draw();}
  return {bind,draw,setData,setHistoryLoader(fn){historyLoader=fn;},reset(){candles=[];analysis=null;zoom=82;offset=0;hasMore=true;loading=false;seriesCache=null;priceProbeY=null;priceView=null;draw();},panBy,format,getView:()=>({offset,zoom,visible:getWindow().data.length}),testLevels:levels};
})();
