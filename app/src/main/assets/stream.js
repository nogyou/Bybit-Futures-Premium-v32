'use strict';
/* Bybit V5 public linear market ticker WebSocket. No credentials, no trading.
 * Large universes: subscription batches/controlled DOM updates, REST fallback in app.js.
 */
const MarketStream = (()=>{
  class Client {
    constructor(onTicker,onStatus){this.onTicker=onTicker;this.onStatus=onStatus;this.chunks=[];this.sockets=[];this.active=true;this.lastTick=0;this.goodConnections=0;this.retry=0;this.attempts={};}
    start(symbols){this.stop(false);this.active=true;const unique=[...new Set(symbols)].filter(s=>/^[A-Z0-9]+USDT$/.test(s));
      // Avoid a single oversized WS payload and the per-connection subscription pressure.
      const size=80;for(let i=0;i<unique.length;i+=size)this.chunks.push(unique.slice(i,i+size));
      this.chunks.forEach((chunk,index)=>this.open(chunk,index));
      this.attempts={};this.onStatus('connecting',0,this.chunks.length);
    }
    open(chunk,index){if(!this.active)return;let ws;
      try{ws=new WebSocket('wss://stream.bybit.com/v5/public/linear');}catch(err){this.onStatus('error',this.goodConnections,this.chunks.length);return;}
      const record={ws,index,timers:[],retry:0,stopped:false};this.sockets[index]=record;
      ws.onopen=()=>{this.attempts[index]=0;this.goodConnections=this.sockets.filter(r=>r?.ws?.readyState===WebSocket.OPEN).length;
        this.onStatus('connected',this.goodConnections,this.chunks.length);
        // Bybit allows multiple topics but sends bursts; subscribe in short batches.
        for(let i=0;i<chunk.length;i+=10){const topics=chunk.slice(i,i+10).map(s=>'tickers.'+s);
          const timer=setTimeout(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({op:'subscribe',args:topics}));},(i/10)*125);record.timers.push(timer);}
        record.ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({op:'ping'}));},20000);
      };
      ws.onmessage=e=>{let msg;try{msg=JSON.parse(e.data);}catch(_){return;}
        if(!String(msg.topic||'').startsWith('tickers.'))return;
        const rows=Array.isArray(msg.data)?msg.data:[msg.data];for(const data of rows){if(!data||!data.symbol)return;
          this.lastTick=Date.now();this.onTicker(data,Number(msg.ts)||this.lastTick);}
      };
      ws.onerror=()=>this.onStatus('degraded',this.goodConnections,this.chunks.length);
      ws.onclose=()=>{record.timers.forEach(clearTimeout);clearInterval(record.ping);
        this.goodConnections=this.sockets.filter(r=>r?.ws?.readyState===WebSocket.OPEN).length;
        this.onStatus('reconnecting',this.goodConnections,this.chunks.length);
        if(this.active&&!record.stopped){this.attempts[index]=(this.attempts[index]||0)+1;const delay=Math.min(30000,1200*Math.pow(1.7,this.attempts[index]))*(0.8+Math.random()*.4);
          record.retryTimer=setTimeout(()=>this.open(chunk,index),delay);}
      };
    }
    stop(notify=true){this.active=false;for(const rec of this.sockets){if(!rec)continue;rec.stopped=true;rec.timers.forEach(clearTimeout);clearInterval(rec.ping);clearTimeout(rec.retryTimer);if(rec.ws.readyState===WebSocket.OPEN||rec.ws.readyState===WebSocket.CONNECTING)rec.ws.close(1000,'pause');}
      this.sockets=[];this.chunks=[];this.goodConnections=0;this.lastTick=0;if(notify)this.onStatus('paused',0,0);
    }
    connected(){return this.goodConnections>0&&Date.now()-this.lastTick<16000;}
  }
  return {Client};
})();
