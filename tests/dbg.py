from lib import *
with sync_playwright() as p:
    b=p.chromium.launch(); s=Session(b,'reception.douala@autocare.test'); s.go('/app/appointments'); print(s.text()[:900])
