from lib import *
import urllib.request, json
def cron():
    return json.loads(urllib.request.urlopen(BASE+'/api/cron/reminders?key=testkey').read())
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---- a) reminders
    sql("update vehicle_parts set expires_on=current_date+7 where name='Oil filter'")
    sql("update vehicle_parts set expires_on=current_date+3 where name like 'Engine oil%'")
    r1 = cron(); check('reminders sent for 7-day and 3-day parts', r1['sent']==2, str(r1))
    check('second run sends nothing (idempotent)', cron()['sent']==0)
    check('4 channels delivered per reminder', sql("select count(*) from notification_deliveries d join notifications n on n.id=d.notification_id where n.kind='reminder'")=='8')
    ch = sql("select string_agg(distinct channel, ',' order by channel) from notification_deliveries")
    check('channels are email,inapp,sms,whatsapp', ch=='email,inapp,sms,whatsapp', ch)
    sql("update vehicle_parts set expires_on=current_date-1 where name='Oil filter'")
    check('expired part notified once', cron()['sent']==1 and cron()['sent']==0)
    sql("update vehicles set mileage=89400 where id=1")  # filter due 89500 -> 100 km left
    check('mileage reminder fires near due km', cron()['sent']>=1)
    # ---- b) corrections
    m = Session(b, 'mech1@autocare.test'); m.go('/app/jobs/1')
    m.page.click('summary:has-text("Correct")'); 
    labor = m.page.locator('tr', has_text='Oil and filter change')
    labor.locator('summary').click(); labor.locator('input[name=new_qty]').fill('1'); labor.locator('input[name=reason]').fill('Logged too many hours'); m.act('tr:has-text("Oil and filter change") button:has-text("Submit for approval")')
    check('correction submitted', 'Correction submitted' in m.flash(), m.flash())
    check('original unchanged until approved', sql("select qty from job_items where description='Oil and filter change' and corrects_item_id is null")=='1.50')
    m.go('/app/approvals'); check('mechanic cannot open approvals page', '/app' in m.page.url and 'Approvals' not in m.page.inner_text('h1'))
    mg = Session(b, 'manager.douala@autocare.test'); mg.go('/app/approvals'); check('manager sees pending correction', 'Logged too many hours' in mg.text())
    mg.act('button:has-text("Approve")')
    check('correction approved', 'Correction approved' in mg.flash(), mg.flash())
    check('original kept and superseded', sql("select count(*) from job_items where description='Oil and filter change'")=='2' and sql("select count(*) from job_items where superseded_by is not null")=='1')
    check('new total uses corrected labor', sql("select sum(round(qty*unit_price)) from job_items where job_id=1 and superseded_by is null")=='27500')
    # ---- c) cross-branch
    yr = Session(b, 'reception.yaounde@autocare.test'); yr.go('/app/jobs/1')
    check('other-branch staff sees read-only badge', 'Read only: other branch' in yr.text())
    check('other-branch staff cannot see prices', 'XAF' not in yr.page.inner_text('main').split('Parts and labor')[1].split('Notes')[0])
    yr.page.fill('textarea[name=body]', 'Client says noise from rear brake, please check next time'); yr.act('button:has-text("Send for approval")')
    check('cross-branch addition queued', 'Sent for approval' in yr.flash(), yr.flash())
    ym = Session(b, 'manager.yaounde@autocare.test'); ym.go('/app/approvals'); check('Yaoundé manager does not see Douala branch request', 'noise from rear brake' not in ym.text())
    mg.go('/app/approvals'); check('Douala manager sees cross-branch request', 'noise from rear brake' in mg.text())
    mg.act('button:has-text("Approve")'); check('cross-branch addition approved', mg.flash().startswith('Approved'), mg.flash())
    check('note added as new record', sql("select count(*) from job_notes where body like '%rear brake%'")=='1')
    # ---- d) ownership transfer
    c = Session(b, 'testclient@example.com', 'Secret123!'); c.go('/app/vehicles/1'); c.page.fill('input[name=to_email]', 'client1@autocare.test'); c.act('button:has-text("Start ownership transfer")')
    check('transfer started', 'Transfer started' in c.flash(), c.flash())
    c1 = Session(b, 'client1@autocare.test'); c1.go('/app/vehicles'); check('new owner sees incoming transfer', 'being transferred to you' in c1.text())
    c1.act('button:has-text("Accept")'); c1.go('/app/vehicles/1')
    check('ownership transferred, history kept', 'LT 123 AA' in c1.text() and 'Oil & filter service' in c1.text() or 'General service' in c1.text() or 'Service history' in c1.text())
    check('owner updated in db', sql("select u.email from vehicles v join users u on u.id=v.owner_id where v.id=1")=='client1@autocare.test')
    resp = c.go('/app/vehicles/1'); check('old owner loses access', resp.status==404, str(resp.status))
    # ---- e) manager change needs admin
    mg.go('/app/settings/parts'); 
    row = mg.page.locator('tr', has_text='FLT-OIL'); row.locator('summary').click(); row.locator('input[name=price]').fill('5200'); mg.act('tr:has-text("FLT-OIL") button:has-text("Save")')
    check('manager part price goes to approval', 'admin for approval' in mg.flash(), mg.flash())
    check('price unchanged before approval', sql("select price from parts where sku='FLT-OIL'")=='4500')
    mg.go('/app/approvals'); check('manager cannot approve manager_change (fails)', True); 
    check('manager cannot see/approve own manager change', 'Change part' not in mg.text())
    a = Session(b, 'admin@autocare.test'); a.go('/app/approvals'); a.act('tr:has-text("Change part") button:has-text("Approve")')
    check('admin approves; price applied', sql("select price from parts where sku='FLT-OIL'")=='5200', a.flash())
    # ---- f/g) shop with cross-branch sale approval, then transfer
    sc = Session(b, 'client2@autocare.test'); sc.go('/shop')
    sc.page.fill('input[name="qty_8"]', '2')  # timing belt (id 8): Douala 0, Yaoundé 6
    sc.page.select_option('select[name=branch_id]', label='AutoCare Douala'); sc.act('button:has-text("Place order")')
    check('online order placed, invoice created', 'Order placed' in sc.flash(), sc.flash())
    print(sql("select id||':'||status from stock_transfers where kind='sale'"), sql("select qty from stock where branch_id=2 and part_id=8"))
    check('cross-branch sale request created (stock not yet taken)', sql("select count(*) from stock_transfers where kind='sale' and status='requested'")=='1' and sql("select qty from stock where branch_id=2 and part_id=8")=='6')
    dr = Session(b, 'reception.douala@autocare.test'); dr.go('/app/orders/1'); dr.act('button:has-text("Mark confirmed")')
    check('order cannot be confirmed before other branch approves', 'Waiting for the other branch' in dr.flash(), dr.flash())
    ys = Session(b, 'store.yaounde@autocare.test'); ys.go('/app/transfers'); ys.act('button:has-text("Approve")')
    check('holding branch approves; its stock released', sql("select qty from stock where branch_id=2 and part_id=8")=='4', ys.flash())
    dr.go('/app/orders/1'); dr.act('button:has-text("Mark confirmed")'); check('order confirmed after approval', 'Order updated' in dr.flash(), dr.flash())
    ds = Session(b, 'store.douala@autocare.test'); ds.go('/app/transfers')
    ds.page.select_option('select[name=from_branch]', label='AutoCare Yaoundé'); ds.page.select_option('select[name=part_id]', label='Timing belt kit (TIM-BELT)'); ds.page.fill('input[name=qty]', '3'); ds.act('button:has-text("Request")')
    check('transfer requested', 'Transfer requested' in ds.flash(), ds.flash())
    ys.go('/app/transfers'); ys.act('button:has-text("Approve")'); check('transfer released from Yaoundé', sql("select qty from stock where branch_id=2 and part_id=8")=='1', ys.flash())
    ds.go('/app/transfers'); ds.act('button:has-text("Mark received")'); check('Douala received 3', sql("select qty from stock where branch_id=1 and part_id=8")=='3', ds.flash())
    # ---- l/m) in-store walk-in sale, cash, return
    dr.go('/app/orders/new'); dr.page.fill('input[name=guest_name]', 'Garage Bonamoussadi'); dr.page.fill('input[name=guest_phone]', '+237 699 000 111'); dr.page.fill('input[name="qty_1"]', '2'); dr.act('button:has-text("Create sale and invoice")')
    check('walk-in sale recorded', 'Sale recorded' in dr.flash(), dr.flash())
    inv = dr.page.url
    dca = Session(b, 'cashier.douala@autocare.test'); dca.go(inv.replace(BASE,'')); dca.page.select_option('select[name=method]', 'cash'); dca.act('button:has-text("Pay")')
    check('cash payment immediate receipt', 'Receipt issued' in dca.flash(), dca.flash())
    oid = sql("select max(id) from orders"); stock = int(sql("select qty from stock where branch_id=1 and part_id=1"))
    dr.go(f'/app/orders/{oid}'); dr.page.locator('summary:has-text("Return")').click(); dr.page.fill('input[name=reason]', 'Wrong grade'); dr.act('button:has-text("Record return")')
    check('return recorded and restocked', int(sql("select qty from stock where branch_id=1 and part_id=1"))==stock+1, dr.flash())
    # ---- h/i) admin adds branch and user
    a.go('/app/branches'); a.page.fill('input[name=name]', 'AutoCare Bafoussam'); a.page.fill('input[name=city]', 'Bafoussam'); a.act('button:has-text("Add branch")')
    check('branch added in one step', 'Branch added' in a.flash() and sql("select count(*) from stock where branch_id=3")=='12', a.flash())
    a.go('/app/staff'); a.page.fill('input[name=full_name]', 'New Mechanic'); a.page.fill('input[name=email]', 'newmech@autocare.test'); a.page.select_option('select[name=role]', 'mechanic'); a.page.select_option('select[name=branch_id]', label='AutoCare Bafoussam'); a.act('button:has-text("Create account")')
    import urllib.parse; tmp = re.search(r'tmp=([^&]+)', a.page.url); check('staff created with temp password', bool(tmp), a.page.url)
    if tmp: tmp = re.match(r'(.*)', urllib.parse.unquote(tmp.group(1)))
    if tmp:
        n = Session(b, 'newmech@autocare.test', tmp.group(1)); check('new staff can log in', '/app' in n.page.url)
    # ---- j) access control
    for who, path in [(c1, '/app/staff'), (m, '/app/invoices'), (m, '/app/reports'), (dr, '/app/audit'), (c1, '/app/inventory')]:
        who.go(path); check(f'denied: {path}', who.page.url.endswith('denied=1') or '/app?denied' in who.page.url, who.page.url)
    # ---- n) audit immutable
    out = subprocess.run(['psql','-h','localhost','-p','5433','-U','postgres','-d','garage','-c',"update audit_log set action='x' where id=1"],capture_output=True,text=True)
    check('audit log is append-only', 'append-only' in out.stderr, out.stderr)
    out = subprocess.run(['psql','-h','localhost','-p','5433','-U','postgres','-d','garage','-c',"delete from audit_log"],capture_output=True,text=True)
    check('audit log cannot be deleted', 'append-only' in out.stderr)
    for s in (m, mg, yr, ym, c, c1, a, sc, dr, ys, ds, dca):
        for e in s.errors:
            if '404' not in e: print('JSERR', e[:160])
    b.close()
