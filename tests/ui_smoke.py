"""오프라인 테스트용 가상 공개 API 응답. 테스트 자료는 실거래 시세가 아님."""
import asyncio, json, random, math, os, time, threading, http.server, socketserver
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]/'app/src/main/assets'
OUTPUT=Path(__file__).resolve().parents[1]/'tests/ui-smoke-preview.png'
PORTRAIT=Path(__file__).resolve().parents[1]/'tests/ui-portrait-preview.png'
random.seed(2)
SYMS=['BTC','ETH','SOL','XRP','DOGE','BNB','ADA','AVAX','LINK','SUI','TRX','LTC','DOT','BCH','NEAR','APT','PEPE','TON','UNI','ARB','OP']
prices=[85000,2750,146.2,.581,.192,620,.79,32.2,18.1,2.16,.26,95,5.9,600,3.1,10,.000011,2.9,7.5,.9,1.3]
tickers=[]
for i,(s,price) in enumerate(zip(SYMS,prices)):
    change=([-.085,-.063,.029,-.04,-.025,.018,-.03,.047,-.009,.054,.023,-.017,.07,-.001,.032,-.015,.095,-.055,.012,.076,.004][i])
    tickers.append(dict(symbol=s+'USDT',lastPrice=f'{price}',price24hPcnt=str(change),highPrice24h=str(price*1.05),lowPrice24h=str(price*.96),turnover24h=str(400_000_000/(i+1)),fundingRate=str(.00012-i*.000003)))
# dynamic 240 closed+current for instruments
NOW=1732120000000
CANDLES={}
for i,s in enumerate(SYMS):
    price=prices[i]*1.12;c=[]
    for k in range(240):
        t=NOW+(k-240)*900000
        op=price
        price=max(prices[i]*.84, price-(prices[i]*.12/240)+math.sin(k/10)*prices[i]*.0016+random.uniform(-.001,.001)*prices[i]);cl=price
        h=max(op,cl)+random.uniform(0,.001)*prices[i];l=min(op,cl)-random.uniform(0,.001)*prices[i]
        c.append([str(t),str(op),str(h),str(l),str(cl),str(350+random.randint(0,800)),str(25000+random.randint(0,800))])
    CANDLES[s+'USDT']=list(reversed(c))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,format,*args):pass

def start_server():
    class Server(socketserver.TCPServer):allow_reuse_address=True
    s=Server(('127.0.0.1',0),H);threading.Thread(target=s.serve_forever,daemon=True).start();return s,s.server_address[1]

async def main():
    server,port=start_server()
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'],headless=True)
        page=await browser.new_page(viewport={'width':1440,'height':810},device_scale_factor=1)
        page_errors=[]
        page.on('pageerror',lambda exc: page_errors.append(str(exc)))
        # Browser sandbox does not allow local navigation; inject the assets into an isolated page.
        import re
        raw=(ROOT/'index.html').read_text()
        html=re.sub(r'<script[^>]+></script>', '', raw)
        html=re.sub(r'<link[^>]+stylesheet[^>]*>', '', html)
        await page.set_content(html,wait_until='load')
        await page.add_style_tag(content=(ROOT/'style.css').read_text())
        fixtures={'tickers':{'list':tickers},'instruments-info':{'list':[{'symbol':s+'USDT','quoteCoin':'USDT','status':'Trading','contractType':'LinearPerpetual','priceFilter':{'tickSize':'0.01'},'leverageFilter':{'maxLeverage':'100'}}for s in SYMS],'nextPageCursor':''},'kline':CANDLES,'orderbook':{'b':[[str(prices[0]-i*.2),'5'] for i in range(50)],'a':[[str(prices[0]+i*.2),'4']for i in range(50)]},'open-interest':{'list':[{'timestamp':'1732120000000','openInterest':'101010'},{'timestamp':'1732119700000','openInterest':'100000'}]}}
        await page.evaluate("""fixtures => {window.fetch=async (url) => { const u=new URL(url); const key=u.pathname.split('/').pop();const v=key==='kline'?{list:fixtures.kline[u.searchParams.get('symbol')]||fixtures.kline['BTCUSDT']}:fixtures[key];return {ok:true, json:async()=>({retCode:0,retMsg:'OK',result:v})};};}""",fixtures)
        # Local ticker WS stub: only simulates a real-time delta; never contacts an exchange.
        await page.evaluate("""() => {
          window.WebSocket=class {
            static OPEN=1;static CONNECTING=0;
            constructor(){this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen?.();},50);}
            send(msg){const q=JSON.parse(msg);if(q.op==='subscribe'&&q.args.some(x=>x==='tickers.BTCUSDT')){
              setTimeout(()=>this.onmessage?.({data:JSON.stringify({topic:'tickers.BTCUSDT',type:'delta',ts:Date.now(),data:{symbol:'BTCUSDT',lastPrice:'84999.12',price24hPcnt:'-0.084'}})}),350);
            }}
            close(){this.readyState=3;this.onclose?.();}
          };
        }""")
        for f in ['engine.js','chart.js','stream.js','app.js','news.js']:
            await page.add_script_tag(content=(ROOT/f).read_text())
        await page.wait_for_function("document.querySelector('#longEntry').textContent !== '--'",timeout=15000)
        assert await page.locator('.market-item').count()==len(SYMS)
        assert await page.locator('#verdictText').inner_text() in ['WAIT','LONG','SHORT']
        assert await page.locator('#longTp1').inner_text()!='--'
        assert 'TP1:' in await page.locator('#longTargetSummary').inner_text()
        assert 'TP1·TP2 가격대 선정 근거' in await page.locator('.target-detail').first.locator('summary').inner_text()
        await page.locator('.target-detail').first.locator('summary').click()
        assert '고정' not in await page.locator('#longTargetDetail').inner_text()
        assert 'TP2' in await page.locator('#longTargetDetail').inner_text()
        await page.locator('.target-detail').first.locator('summary').click()
        # News UI: simulate trusted parsed RSS metadata (never present it as live news).
        await page.evaluate('''() => BTCNews.ingestForTest([{
          title:'비트코인 기사 UI 검증용 가상 헤드라인',source:'TEST · 가상 출처',
          url:'https://cointelegraph.com/news/btc-ui-test',publishedAt:Date.now()-300000
        }])''')
        assert '비트코인 기사 UI 검증' in await page.locator('#btcNewsHeadline').inner_text()
        await page.locator('#btcNewsTicker').click()
        assert await page.locator('.news-story').count()==1
        assert '5분 전' in await page.locator('.news-story-meta').inner_text()
        await page.locator('#dialogClose').click()
        assert 'hidden' in (await page.locator('#overlay').get_attribute('class'))

        assert await page.locator('#shortSl').inner_text()!='--'
        # WebSocket delta should update selected price without waiting for REST polling.
        await page.wait_for_function("document.querySelector('#currentPrice').textContent.includes('84,999.12')",timeout=5000)
        assert '-8.40%' in await page.locator('#priceChange').inner_text()
        # Verify sort flips and market list updates
        await page.locator('[data-sort="change-asc"]').click()
        assert 'PEPE' in await page.locator('.market-item').last.inner_text()  # highest simulated performance last
        await page.locator('[data-sort="change-desc"]').click()
        assert 'PEPE' in await page.locator('.market-item').first.inner_text()
        await page.locator('#searchSymbol').fill('SOL')
        assert await page.locator('.market-item').count()==1
        await page.locator('#clearSearch').click()
        assert await page.locator('.market-item').count()==len(SYMS)
        # v3.2: leverage and multi-timeframe recommendation, chart pan and modes
        assert await page.locator('#durationTypes span').count()==3
        await page.locator('#leverageRange').evaluate("el => {el.value='50';el.dispatchEvent(new Event('input',{bubbles:true}));}")
        assert await page.locator('#leverageDisplay').inner_text()=='50x'
        assert await page.locator('#leverageNumber').input_value()=='50'
        await page.locator('#leverageNumber').fill('23')
        await page.locator('#leverageNumber').dispatch_event('change')
        assert await page.locator('#leverageDisplay').inner_text()=='23x'
        assert await page.locator('#leverageRange').input_value()=='23'
        await page.locator('#leverageNumber').fill('150')
        await page.locator('#leverageNumber').dispatch_event('change')
        assert await page.locator('#leverageDisplay').inner_text()=='100x'
        assert await page.locator('#leverageRange').input_value()=='100'
        assert 'TP1' in await page.locator('#riskResults').inner_text()
        await page.locator('#lineMode').click()
        assert 'LONG' in await page.locator('#lineMode').inner_text()
        await page.evaluate('TradeChart.panBy(20)')
        assert await page.evaluate('TradeChart.getView().offset')==20
        await page.locator('#liveChart').click()
        assert await page.evaluate('TradeChart.getView().offset')==0
        # Test timeframe and symbol selection
        await page.locator('.market-item').filter(has_text='ETHUSDT').first.click()
        await page.wait_for_function("document.querySelector('#symbolTitle').textContent==='ETHUSDT'",timeout=10000)
        await page.locator('[data-tf="5"]').click()
        assert await page.locator('[data-tf="5"]').get_attribute('class')=='selected'
        await page.locator('.market-item').filter(has_text='BTCUSDT').first.click()
        await page.wait_for_function("document.querySelector('#symbolTitle').textContent==='BTCUSDT'",timeout=10000)
        await page.wait_for_timeout(150)
        # Mark test-only image unambiguously as non-live.
        await page.evaluate("""() => {const el=document.createElement('div');el.textContent='UI 검증 미리보기 · 가상 테스트 시세 (실거래 데이터 아님)';Object.assign(el.style,{position:'fixed',zIndex:999,left:'50%',bottom:'6px',transform:'translateX(-50%)',background:'#ad7720',color:'#06111e',font:'bold 12px system-ui',padding:'5px 18px',borderRadius:'6px'});document.body.append(el);}""")
        # Reset display mode to ALL for a useful reference screenshot.
        await page.locator('#lineMode').click()
        await page.locator('#lineMode').click()
        assert '전체선' in await page.locator('#lineMode').inner_text()
        await page.screenshot(path=str(OUTPUT),full_page=True)
        # Portrait tablet: all panels should stack with zero horizontal viewport overflow.
        await page.set_viewport_size({'width':810,'height':1280})
        await page.wait_for_timeout(350)
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'), 'portrait horizontal clipping'
        assert await page.locator('#riskResults').is_visible()
        assert await page.locator('#topnav').is_visible()
        await page.screenshot(path=str(PORTRAIT),full_page=True)
        await page.set_viewport_size({'width':1440,'height':810})
        print('Screenshots',OUTPUT,PORTRAIT)
        print('Market rows',await page.locator('.market-item').count(),'LONG',await page.locator('#longEntry').inner_text(),'SHORT',await page.locator('#shortEntry').inner_text(),'Verdict',await page.locator('#verdictText').inner_text())
        print('Browser errors',page_errors)
        assert not page_errors, 'browser JS error'
        await browser.close()
    server.shutdown()
if __name__=='__main__':asyncio.run(main())
