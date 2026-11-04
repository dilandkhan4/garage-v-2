export const fmt = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} XAF`;
export const fdate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
export const fdt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const str = (fd, k) => String(fd.get(k) ?? '').trim();
export const int = (fd, k, d = null) => { const v = fd.get(k); if (v === null || v === '') return d; const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
export const addMonths = (date, m) => { const d = new Date(date); d.setMonth(d.getMonth() + m); return d; };
export const iso = (d) => new Date(d).toISOString().slice(0, 10);
export const STATUS_LABEL = {
  checked_in: 'Checked in', diagnosis: 'Diagnosis', quoted: 'Quote sent', approved: 'Approved', in_progress: 'In progress',
  quality_check: 'Quality check', ready: 'Ready for pickup', invoiced: 'Invoiced', paid: 'Paid', picked_up: 'Picked up', cancelled: 'Cancelled',
};
export const ROLE_LABEL = { admin: 'Admin', manager: 'Branch manager', receptionist: 'Receptionist', mechanic: 'Mechanic', storekeeper: 'Storekeeper', cashier: 'Cashier / accountant', instructor: 'Instructor', student: 'Student', school_rep: 'School representative', client: 'Client' };
export const randomPassword = () => Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6).toUpperCase() + '7';
export const back = (path, kind, msg, extra = '') => `${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}${extra}`;
