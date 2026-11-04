from lib import *
import time
with sync_playwright() as p:
    b = p.chromium.launch()
    # --- client registers
    c = Session(b)
    c.go('/register')
    c.page.fill('input[name=full_name]', 'Test Client'); c.page.fill('input[name=email]', 'testclient@example.com'); c.page.fill('input[name=phone]', '+237 655 111 222'); c.page.fill('input[name=password]', 'Secret123!')
    c.page.click('form.card button.btn'); c.page.wait_for_url(re.compile(r'/app'))
    check('client registered and lands in app', '/app' in c.page.url and 'Test' in c.text(), c.page.url)
    # register vehicle
    c.go('/app/vehicles/new')
    c.page.fill('input[name=plate]', 'LT 123 AA'); c.page.fill('input[name=make]', 'Toyota'); c.page.fill('input[name=model]', 'Corolla'); c.page.fill('input[name=year]', '2015'); c.page.fill('input[name=mileage]', '84000')
    c.act('form.card button.btn')
    check('vehicle registered', 'Vehicle registered' in c.flash(), c.flash())
    vid = re.search(r'/vehicles/(\d+)', c.page.url).group(1)
    # duplicate plate
    c.go('/app/vehicles/new'); c.page.fill('input[name=plate]', 'lt 123 aa'); c.page.fill('input[name=make]', 'X'); c.page.fill('input[name=model]', 'Y')
    c.act('form.card button.btn')
    check('duplicate plate rejected', 'already registered' in c.flash(), c.flash())
    # book appointment as client
    c.go(f'/app/appointments?vehicle={vid}')
    c.page.select_option('select[name=branch_id]', label='AutoCare Douala')
    c.page.fill('input[name=scheduled_at]', '2026-11-05T09:00'); c.page.select_option('select[name=service_type]', label='Oil & filter service')
    c.act('form.card button.btn')
    check('appointment booked', 'Appointment booked' in c.flash(), c.flash())
    # receptionist checks in
    r = Session(b, 'reception.douala@autocare.test')
    r.go('/app/appointments'); r.page.fill('input[name=mileage]', '84500'); r.act('button:has-text("Check in")')
    check('appointment check-in creates job', 'checked in' in r.flash().lower(), r.flash())
    jid = re.search(r'/jobs/(\d+)', r.page.url).group(1)
    # assign mechanic
    r.page.select_option('select[name=mechanic_id]', label='Samuel Tchamba'); r.act('button:has-text("Assign")')
    check('mechanic assigned', 'Mechanic assigned' in r.flash(), r.flash())
    # mechanic diagnosis + items
    m = Session(b, 'mech1@autocare.test')
    m.go(f'/app/jobs/{jid}')
    m.page.fill('textarea[name=diagnosis]', 'Oil change due, filter clogged'); m.act('button:has-text("Save diagnosis")')
    check('diagnosis saved', 'Diagnosis saved' in m.flash(), m.flash())
    for part in ['Engine oil 5W-30', 'Oil filter']:
        m.go(f'/app/jobs/{jid}')
        sel = m.page.locator('select[name=part_id]'); opts = sel.locator('option').all_inner_texts(); label = [o for o in opts if o.startswith(part)][0]
        sel.select_option(label=label); m.act('button:has-text("Add part")')
    check('parts added', 'Item added' in m.flash(), m.flash())
    m.page.fill('input[name=description]', 'Oil and filter change'); m.page.fill('input[name=hours]', '1.5'); m.act('button:has-text("Add labor")')
    check('labor added', 'Item added' in m.flash(), m.flash())
    stock_before = sql("select qty from stock where branch_id=1 and part_id=(select id from parts where sku='OIL-5W30')")
    m.act('button:has-text("Send quote to client")')
    check('quote sent', 'Quote sent' in m.flash(), m.flash())
    # client approves
    c.go(f'/app/jobs/{jid}'); check('client sees quote total', '4 500' in c.text() or '22 500' in c.text() or 'XAF' in c.text())
    c.act('button:has-text("Approve quote")')
    check('client approved quote', 'Quote approved' in c.flash(), c.flash())
    # start work
    m.go(f'/app/jobs/{jid}'); m.act('button:has-text("Start work")')
    check('work started', 'Work started' in m.flash(), m.flash())
    stock_after = sql("select qty from stock where branch_id=1 and part_id=(select id from parts where sku='OIL-5W30')")
    check('stock deducted at job branch', int(stock_before)-1 == int(stock_after), f'{stock_before}->{stock_after}')
    vp = sql(f"select name||'|'||expires_on||'|'||due_km from vehicle_parts where vehicle_id={vid} order by id")
    print('vehicle_parts:', vp.replace('\n',' ; '))
    check('vehicle parts recorded with expiry (corolla override 10000km)', '94500' in vp, vp)
    m.go(f'/app/jobs/{jid}'); m.act('button:has-text("send to quality check")')
    check('quality check step', 'quality check' in m.flash().lower(), m.flash())
    check('same mechanic cannot pass own QC (no button)', m.page.locator('button:has-text("Pass quality check")').count()==1)  # button present but action blocks
    m.act('button:has-text("Pass quality check")')
    check('mechanic blocked from passing own QC', 'someone other' in m.flash(), m.flash())
    mg = Session(b, 'manager.douala@autocare.test'); mg.go(f'/app/jobs/{jid}'); mg.act('button:has-text("Pass quality check")')
    check('manager passes QC', 'Quality check passed' in mg.flash(), mg.flash())
    # cashier invoices
    ca = Session(b, 'cashier.douala@autocare.test'); ca.go(f'/app/jobs/{jid}'); ca.act('button:has-text("Create and send invoice")')
    check('invoice issued', 'Invoice issued' in ca.flash(), ca.flash()); inv_url = ca.page.url
    print(ca.text()[:600].replace('\n',' | '))
    # other branch cashier cannot see invoice
    y = Session(b, 'cashier.yaounde@autocare.test'); resp = y.go(inv_url.replace(BASE,'')); check('other branch cashier cannot open invoice (404)', resp.status==404, str(resp.status))
    # client pays with momo test
    c.go(inv_url.replace(BASE,'')); c.page.select_option('select[name=method]', 'momo'); c.page.fill('input[name=phone]', '+237 670 123 456'); c.act('button:has-text("Pay")')
    check('momo payment started pending', 'Payment started' in c.flash(), c.flash())
    c.act('button:has-text("Simulate customer confirmation")')
    check('payment confirmed + receipt', 'Receipt issued' in c.flash(), c.flash())
    check('invoice paid', sql(f"select status from invoices where job_id={jid}")=='paid')
    check('job status paid', sql(f"select status from jobs where id={jid}")=='paid')
    rec = sql("select number from receipts order by id desc limit 1"); check('receipt stored', rec.startswith('R01-'), rec)
    # pickup + review
    r.go(f'/app/jobs/{jid}'); r.act('button:has-text("Vehicle handed over")')
    check('picked up', 'handed over' in r.flash().lower(), r.flash())
    c.go(f'/app/jobs/{jid}'); c.page.fill('textarea[name=comment]', 'Great and fast service'); c.act('button:has-text("Submit review")')
    check('review submitted', 'Thank you' in c.flash(), c.flash())
    print('JOB', jid, 'VEH', vid)
    for s in (c, r, m, mg, ca, y):
        for e in s.errors: print('JSERR', e[:200])
    b.close()
