'use strict';
/* BTC headlines are publisher RSS metadata, not trade signals. No invented articles. */
(() => {
  const $=id=>document.getElementById(id);
  const REFRESH_MS=3*60*1000,ROTATE_MS=8500;
  let articles=[],updated=0,index=0,loading=false,error='',reqCounter=0,pending=null;
  const safeUrl=url=>{
    try {const u=new URL(url);return u.protocol==='https:'&&['news.google.com','cointelegraph.com'].includes(u.hostname)?u.href:null;}
    catch(_){return null;}
  };
  function ago(ts){
    if(!Number.isFinite(ts)||ts<=0)return '발행시각 미확인';
    const age=Math.max(0,Date.now()-ts),m=Math.floor(age/60000);
    if(m<1)return '방금';if(m<60)return m+'분 전';
    const h=Math.floor(m/60);return h<24?h+'시간 전':Math.floor(h/24)+'일 전';
  }
  function renderTicker(){
    const el=$('btcNewsHeadline'),age=$('btcNewsAge'),dot=$('btcNewsDot');if(!el)return;
    dot?.classList.toggle('news-live',articles.length>0);
    if(articles.length){const n=articles[index%articles.length];el.textContent=n.title;el.title=n.title;
      age.textContent=`${n.source} · 기사 ${ago(n.publishedAt)} · 확인 ${ago(updated)}`;
    } else {el.textContent=loading?'비트코인 뉴스 불러오는 중…':error?'뉴스 연결 실패 · 눌러서 다시 확인':'비트코인 최신 뉴스 확인 중';
      age.textContent=error?'뉴스 갱신 실패 · 매매 신호 미반영':'3분 자동 확인 · 클릭해 목록 보기';
    }
  }
  function openUrl(url){const clean=safeUrl(url);if(!clean)return;
    if(window.AndroidBridge?.openNews){window.AndroidBridge.openNews(clean);return;}
    window.open(clean,'_blank','noopener,noreferrer');
  }
  function showPanel(){
    const overlay=$('overlay'),body=$('dialogBody');if(!overlay||!body)return;
    $('dialogTitle').textContent='₿ 비트코인 최신 뉴스';body.replaceChildren();
    const top=document.createElement('div');top.className='news-dialog-head';
    const info=document.createElement('p');info.textContent=updated?`마지막 조회 ${new Date(updated).toLocaleTimeString('ko-KR')} · 3분마다 새 기사 확인`:'뉴스 조회 대기 중';
    const refresh=document.createElement('button');refresh.type='button';refresh.className='news-refresh-button';refresh.textContent=loading?'조회 중…':'↻ 지금 갱신';refresh.disabled=loading;refresh.addEventListener('click',()=>refreshNews(true));
    top.append(info,refresh);body.append(top);
    const note=document.createElement('div');note.className='news-info-note';note.textContent='기사 원문은 외부 브라우저에서 열립니다. 뉴스 발행 시각과 앱 갱신 시각은 다르며, 기사만으로 매매 신호가 확정되지는 않습니다.';body.append(note);
    const list=document.createElement('div');list.className='news-list';
    if(!articles.length){const blank=document.createElement('p');blank.textContent=error?`기사 조회 실패: ${error}`:'기사 조회 중입니다. 네트워크 연결을 확인해 주세요.';list.append(blank);}
    articles.forEach(n=>{
      const b=document.createElement('button');b.type='button';b.className='news-story';
      const title=document.createElement('span');title.className='news-story-title';title.textContent=n.title;
      const meta=document.createElement('span');meta.className='news-story-meta';meta.textContent=n.source+' · '+ago(n.publishedAt);
      b.append(title,meta);b.addEventListener('click',()=>openUrl(n.url));list.append(b);
    });
    body.append(list);overlay.classList.remove('hidden');
  }
  function ingest(raw){
    let result=raw;
    try{if(typeof raw==='string')result=JSON.parse(raw);}catch(_){result=[];}
    if(!Array.isArray(result))result=[];
    const seen=new Set();articles=result.filter(n=>n&&typeof n.title==='string'&&safeUrl(n.url)&&typeof n.source==='string').map(n=>({
      title:n.title.slice(0,280).trim(),source:n.source.slice(0,80),url:safeUrl(n.url),publishedAt:Number(n.publishedAt)||0
    })).filter(n=>{const key=n.title.toLowerCase();if(!n.title||seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,30);
    updated=Date.now();index=0;error='';loading=false;renderTicker();
    if(!$('overlay').classList.contains('hidden')&&$('dialogTitle').textContent.includes('비트코인'))showPanel();
  }
  window.__receiveNews=(id,raw,err)=>{
    if(!pending||id!==pending)return;
    pending=null;loading=false;
    if(err){error=String(err).slice(0,180);renderTicker();}
    else ingest(raw);
    if(!$('overlay').classList.contains('hidden')&&$('dialogTitle').textContent.includes('비트코인'))showPanel();
  };
  function refreshNews(manual=false){
    if(loading)return;
    if(!window.AndroidBridge?.requestNews){error='뉴스 피드는 Android 앱에서만 조회 가능';renderTicker();if(manual)showPanel();return;}
    loading=true;error='';renderTicker();
    const id='news'+(++reqCounter);pending=id;
    try{window.AndroidBridge.requestNews(id);}catch(e){window.__receiveNews(id,'',String(e));}
    setTimeout(()=>{if(pending===id)window.__receiveNews(id,'','뉴스 서버 응답 시간 초과');},30000);
  }
  function init(){
    const b=$('btcNewsTicker');if(!b)return;
    b.addEventListener('click',showPanel);
    refreshNews();
    setInterval(()=>{if(!document.hidden&&!loading)refreshNews();},REFRESH_MS);
    setInterval(()=>{if(!document.hidden&&articles.length>1){index=(index+1)%Math.min(8,articles.length);renderTicker();}},ROTATE_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-updated>REFRESH_MS)refreshNews();});
  }
  // Test harness only; no fake news is used by the production app.
  window.BTCNews={init,refresh:refreshNews,ingestForTest:ingest,getItems:()=>articles.slice(),getUpdatedAt:()=>updated};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
