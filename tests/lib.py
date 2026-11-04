import re, subprocess, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:3000'
PW = 'Demo1234!'
def sql(q):
    return subprocess.run(['psql','-h','localhost','-p','5433','-U','postgres','-d','garage','-At','-c',q],capture_output=True,text=True).stdout.strip()
class Session:
    def __init__(self, browser, email=None, pw=PW, lang=None):
        self.ctx = browser.new_context(viewport={'width':1200,'height':900})
        self.ctx.add_cookies([{'name':'lang','value':lang or 'en','url':BASE}])
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('console', lambda m: self.errors.append(m.text) if m.type=='error' and 'favicon' not in m.text else None)
        if email: self.login(email, pw)
    def go(self, path):
        r = self.page.goto(BASE+path); return r
    def login(self, email, pw=PW):
        self.go('/login'); self.page.fill('input[name=email]', email); self.page.fill('input[name=password]', pw)
        self.page.click('form.card button.btn'); self.page.wait_for_url(re.compile(r'/app'))
    def text(self): return self.page.inner_text('body')
    def flash(self):
        el = self.page.query_selector('.alert'); return el.inner_text() if el else ''
    def act(self, selector, **kw):
        import time
        before = (self.page.url, self.flash())
        self.page.click(selector, **kw)
        for _ in range(60):
            time.sleep(0.15)
            try:
                self.page.wait_for_load_state('networkidle', timeout=3000)
            except Exception: pass
            now = (self.page.url, self.flash())
            if now != before: break
        time.sleep(0.3)
def check(name, cond, detail=''):
    print(('PASS ' if cond else 'FAIL ')+name+(f'  -> {detail}' if (not cond and detail) else ''))
    return cond
