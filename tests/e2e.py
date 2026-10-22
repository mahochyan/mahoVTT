"""Browser interaction checks. Requires Python + playwright + requests.
Default: real browser HTTP. SAGAS_TEST_BRIDGE=1 uses a test transport bridge
when the execution environment disallows browser networking. The bridge still
calls the real isolated application server; it does not mock game outcomes.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from threading import Thread
import os, json, time, socket, subprocess
import requests
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
ART=ROOT/'tests/artifacts'; ART.mkdir(parents=True,exist_ok=True)
BRIDGE=os.getenv('SAGAS_TEST_BRIDGE')=='1'
def freeport():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); return sock.getsockname()[1]
class FakeAI(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        data=json.dumps({'data':[{'id':'wire-good'}]}).encode(); self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(200)
        if body.get('stream'):
            self.send_header('Content-Type','text/event-stream'); self.end_headers()
            chunks=[{'choices':[{'delta':{'content':'铜灯依然亮着。已发生的事实留在日志里，下一步由你决定。'}}]}]
            if body.get('model')!='wire-broken': chunks.append({'choices':[{'delta':{},'finish_reason':'stop'}]})
            for c in chunks: self.wfile.write(('data: '+json.dumps(c,ensure_ascii=False)+'\n\n').encode())
            if body.get('model')!='wire-broken': self.wfile.write(b'data: [DONE]\n\n')
        else:
            self.send_header('Content-Type','application/json'); self.end_headers()
            self.wfile.write(json.dumps({'choices':[{'message':{'reasoning_content':'DO_NOT_DISPLAY','content':json.dumps({'command':{'type':'interact','actorId':'pc','targetId':'scene'}})}}]}).encode())

def run():
    port=freeport(); base=f'http://127.0.0.1:{port}'
    fake=ThreadingHTTPServer(('127.0.0.1',0),FakeAI); Thread(target=fake.serve_forever,daemon=True).start()
    results=[]; errors=[]
    with TemporaryDirectory(prefix='graylight-browser-') as temp:
        env={**os.environ,'PORT':str(port),'SAGAS_DATA_DIR':temp,'AI_PROVIDER':'mock'}
        proc=subprocess.Popen(['node','dist/server.js'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    if requests.get(base+'/api/health',timeout=1).ok:break
                except requests.RequestException: pass
                time.sleep(.05)
            else: raise RuntimeError('App failed to start')
            def api(path,body=None,method=None):
                r=requests.request(method or ('POST' if body is not None else 'GET'),base+path,json=body,timeout=30);r.raise_for_status();return r.json()
            with sync_playwright() as p:
                executable=os.getenv('CHROMIUM_EXECUTABLE')
                launch={'headless':True,'args':['--no-sandbox']}
                if executable:launch['executable_path']=executable
                browser=p.chromium.launch(**launch)
                page=browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1)
                page.on('pageerror',lambda error:errors.append(str(error)))
                if BRIDGE:
                    def transport(payload):
                        r=requests.request(payload.get('method','GET'),base+payload['path'],headers=payload.get('headers') or {},data=payload.get('body'),timeout=60)
                        return {'status':r.status_code,'text':r.text,'headers':dict(r.headers)}
                    page.expose_function('__request',transport)
                    page.set_content('<html lang="zh-CN"><head><meta charset="UTF-8"></head><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body></html>')
                    page.add_style_tag(content=(ROOT/'public/style.css').read_text(encoding='utf8'))
                    page.evaluate("""() => {const m=new Map();Object.defineProperty(window,'sessionStorage',{value:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}});history.pushState=()=>{};history.replaceState=()=>{};window.fetch=async(path,options={})=>{const r=await window.__request({path:String(path),method:options.method||'GET',headers:options.headers||{},body:options.body});return new Response(r.text,{status:r.status,headers:r.headers});};} """)
                    page.add_script_tag(content=(ROOT/'public/app.js').read_text(encoding='utf8'),type='module')
                else:page.goto(base,wait_until='networkidle')
                def wait(predicate,seconds=12):
                    until=time.time()+seconds
                    while time.time()<until:
                        page.wait_for_timeout(100)
                        if predicate():return
                    raise AssertionError('Condition timed out')
                page.get_by_label('冒险者的名字').fill('端到端旅人')
                page.get_by_role('button',name='开始冒险').click()
                page.locator('#battle-map').wait_for()
                cid=api('/api/campaigns')[0]['id']
                assert api('/api/campaigns/'+cid)['state']['playerName']=='端到端旅人'
                results.append({'test':'create campaign and render character/map','pass':True})
                page.get_by_role('button',name='伊蕾娅 · 接受委托').click()
                wait(lambda:api('/api/campaigns/'+cid)['state']['version']>=1)
                wait(lambda:page.get_by_label('描述你的行动').is_enabled())
                page.get_by_label('描述你的行动').fill('观察周围')
                page.get_by_role('button',name='发送',exact=True).click()
                wait(lambda:api('/api/campaigns/'+cid)['turns'][-1]['narrationStatus']=='done')
                assert api('/api/campaigns/'+cid)['state']['objectives'][0]['done']
                results.append({'test':'quest and free-text streaming action','pass':True})
                page.get_by_role('button',name='人工修正角色卡').click()
                f=api('/api/campaigns/'+cid)
                requests.post(base+f'/api/campaigns/{cid}/turn',json={'requestId':'ui-conflict-0001','baseVersion':f['state']['version'],'command':{'type':'interact','actorId':'pc','targetId':'scene'}},timeout=30)
                page.locator('#hp-form input[name=hp]').fill('1')
                page.get_by_role('button',name='保存修正').click()
                wait(lambda:'版本' in page.locator('#toast').inner_text())
                assert api('/api/campaigns/'+cid)['state']['actors'][0]['hp']==36
                page.get_by_role('button',name='关闭弹窗').click()
                results.append({'test':'stale manual edit rejected without overwriting HP','pass':True})
                page.get_by_role('button',name='返回战役首页').click()
                page.get_by_role('button',name='导入存档').wait_for()
                with page.expect_file_chooser() as fc:
                    page.get_by_role('button',name='导入存档').click()
                fc.value.set_files(str(ROOT/'tests/fixtures/combat.json'))
                page.locator('#battle-map [data-actor=g1]').wait_for()
                wait(lambda:len(api('/api/campaigns'))==2)
                cid=api('/api/campaigns')[0]['id']
                page.locator('#battle-map [data-actor=g1]').click()
                wait(lambda:any(x['type']=='attack_rolled' for x in api('/api/campaigns/'+cid)['events']))
                results.append({'test':'UI direct attack executes authoritative dice/combat','pass':True})
                cfg={'mode':'openai','baseUrl':f'http://127.0.0.1:{fake.server_port}/v1','model':'wire-broken','timeoutMs':3000,'maxTokens':512,'contextChars':24000,'jsonMode':'off'}
                api('/api/settings',cfg)
                wait(lambda:page.get_by_label('描述你的行动').is_enabled())
                page.get_by_label('描述你的行动').fill('观察当前场景')
                page.get_by_role('button',name='发送',exact=True).click()
                wait(lambda:api('/api/campaigns/'+cid)['turns'][-1]['narrationStatus']=='failed')
                before=api('/api/campaigns/'+cid)
                api('/api/settings',{**cfg,'model':'wire-good'})
                retry=page.get_by_role('button',name='重试叙事，不重新掷骰')
                retry.wait_for();retry.click()
                wait(lambda:api('/api/campaigns/'+cid)['turns'][-1]['narrationStatus']=='done')
                after=api('/api/campaigns/'+cid)
                assert before['state']['version']==after['state']['version']
                assert before['dice']==after['dice']
                assert before['state']['actors']==after['state']['actors']
                wait(lambda:page.locator('.notice-bar').count()==0)
                results.append({'test':'broken narration retries without rerolling or changing HP','pass':True})
                page.screenshot(path=str(ART/'desktop.png'),full_page=True)
                page.get_by_role('button',name='世界书',exact=True).click()
                page.get_by_role('dialog').wait_for()
                assert '真实原因' not in page.get_by_role('dialog').inner_text()
                page.screenshot(path=str(ART/'worldbook.png'),full_page=True)
                page.get_by_role('button',name='关闭弹窗').click()
                page.set_viewport_size({'width':390,'height':844})
                page.wait_for_timeout(200)
                assert page.evaluate('document.body.scrollWidth')<=390
                page.screenshot(path=str(ART/'mobile.png'),full_page=True)
                assert not errors, errors
                results.append({'test':'player-only worldbook, mobile width, no JS exceptions','pass':True})
                # A clean, genuinely playable guard-room preview, separate from test fixtures.
                api('/api/settings',{'mode':'mock'})
                page.set_viewport_size({'width':1600,'height':1000})
                page.get_by_role('button',name='返回战役首页').click()
                with page.expect_file_chooser() as preview_fc:
                    page.get_by_role('button',name='导入存档').click()
                preview_fc.value.set_files(str(ROOT/'examples/02-guardroom-battle.json'))
                page.locator('#battle-map').wait_for()
                page.wait_for_timeout(3500)
                page.screenshot(path=str(ART/'adventure-preview.png'),full_page=True)
                browser.close()
        finally:
            proc.kill();proc.wait(timeout=5);fake.shutdown();fake.server_close()
    report={'transport':'isolated HTTP bridge' if BRIDGE else 'native browser HTTP','passed':len(results),'results':results,'pageErrors':errors}
    (ART/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':run()
