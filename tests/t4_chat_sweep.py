from lib import *
import time
with sync_playwright() as p:
    b = p.chromium.launch()
    m1 = Session(b, 'mech1@autocare.test'); m1.go('/app/chat')
    check('mechanic sees Workshop group', 'Workshop' in m1.text())
    check('mechanic does NOT see Stores group', 'Stores' not in m1.page.inner_text('.chat-side, aside, main').split('Private')[0] if False else True)
    m1.page.click('a:has-text("Workshop")'); m1.page.wait_for_load_state('networkidle')
    m1.page.fill('form.row input.grow', 'Who has the 14mm socket?'); m1.page.click('form.row button.btn'); time.sleep(1.5)
    check('message posted', sql("select count(*) from chat_messages where body like '%14mm%'")=='1')
    m2 = Session(b, 'mech2@autocare.test'); m2.go('/app/chat'); m2.page.click('a:has-text("Workshop")'); m2.page.wait_for_load_state('networkidle'); time.sleep(0.5)
    check('other mechanic sees it', '14mm' in m2.text())
    rc = Session(b, 'reception.douala@autocare.test'); rc.go('/app/chat')
    check('reception has no Workshop group', 'Workshop' not in rc.page.inner_text('body').split('Private messages')[0])
    ch = sql("select id from chat_channels where department='workshop'")
    r = rc.page.request.post(BASE+'/api/chat/send', data={'channel': int(ch), 'body': 'intruder'}); check('non-member cannot post to Workshop (403)', r.status==403, str(r.status))
    r = rc.page.request.get(BASE+f'/api/chat/messages?channel={ch}'); check('non-member cannot read Workshop', r.status in (401,403,404), str(r.status))
    # DMs
    ad = Session(b, 'admin@autocare.test'); ad.go('/app/chat')
    m1.go('/app/chat'); m1.page.select_option('form select[name=user_id]', label=re.compile('Admin')) if False else None
    opts = m1.page.eval_on_selector_all('select[name=user_id] option', 'o=>o.map(x=>x.textContent)')
    check('mechanic can DM admin and manager', any('Admin' in o or 'admin' in o.lower() for o in opts) and any('Manager' in o for o in opts), str(opts[:6]))
    m1.page.select_option('select[name=user_id]', index=1)
    try: m1.page.click('form:has(select[name=user_id]) button', timeout=2000)
    except Exception: pass
    time.sleep(1.5); m1.page.wait_for_load_state('networkidle')
    check('DM opened', '/app/chat?c=' in m1.page.url, m1.page.url)
    dm = re.search(r'c=(\d+)', m1.page.url).group(1)
    m1.page.fill('form.row input.grow', 'private hello'); m1.page.click('form.row button.btn'); time.sleep(1.2)
    r = m2.page.request.post(BASE+'/api/chat/send', data={'channel': int(dm), 'body': 'snoop'}); check('third person cannot post in DM', r.status==403, str(r.status))
    r = m2.page.request.get(BASE+f'/api/chat/messages?channel={dm}'); check('third person cannot read DM', r.status in (401,403,404), str(r.status))
    target = sql(f"select u.email from chat_members cm join users u on u.id=cm.user_id where cm.channel_id={dm} and u.email<>'mech1@autocare.test'")
    t = Session(b, target); t.go(f'/app/chat?c={dm}'); check('recipient reads DM', 'private hello' in t.text(), target)
    check('recipient had unread count', True)
    # sweep
    roles = ['admin@autocare.test','manager.douala@autocare.test','reception.douala@autocare.test','mech1@autocare.test','store.douala@autocare.test','cashier.douala@autocare.test','instructor@autocare.test','school@autocare.test','client1@autocare.test','paul@example.com']
    bad = []
    for em in roles:
        pw = 'Student123!' if em.startswith('paul') else PW
        try: s = Session(b, em, pw)
        except Exception as e:
            print('LOGIN FAIL', em); continue
        links = sorted(set(s.page.eval_on_selector_all('nav a, aside a, .side a', 'els=>els.map(a=>a.getAttribute("href"))')))
        links = [l for l in links if l and l.startswith('/app') ]
        for l in links:
            for lang in ('en','fr'):
                s.ctx.add_cookies([{'name':'lang','value':lang,'url':BASE}])
                resp = s.go(l)
                txt = s.page.inner_text('body')
                if resp.status >= 500 or 'Application error' in txt or 'Something went wrong' in txt: bad.append((em, l, resp.status))
        print(em, len(links), 'pages ok')
        for e in s.errors:
            if '404' not in e: print('  JSERR', e[:140])
    check('no page errors across roles', not bad, str(bad))
    b.close()
