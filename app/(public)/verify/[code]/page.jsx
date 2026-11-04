import QRCode from 'qrcode';
import { headers } from 'next/headers';
import { q1 } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdate } from '@/lib/util';
import PrintButton from '@/components/PrintButton';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificate verification' };
export default async function Verify({ params }) {
  const { code } = await params; const t = await getT(await getUser());
  const c = await q1(`select c.*, u.full_name, p.name program, p.duration_weeks, b.name branch, e.start_date, e.end_date from certificates c join enrollments e on e.id=c.enrollment_id join users u on u.id=e.student_id join programs p on p.id=e.program_id join branches b on b.id=e.branch_id where c.code=$1`, [code]);
  if (!c) return (<div className="wrap" style={{ paddingTop: 40, maxWidth: 560 }}><div className="alert bad"><b>{t('Certificate not found.')}</b> {t('This code does not match any certificate we issued.')}</div></div>);
  const h = await headers(); const base = process.env.BASE_URL || `${h.get('x-forwarded-proto') || 'http'}://${h.get('host')}`;
  const qr = await QRCode.toDataURL(`${base}/verify/${c.code}`, { margin: 1, width: 180 });
  return (<div className="wrap" style={{ paddingTop: 30, maxWidth: 720 }}>
    {c.revoked ? <div className="alert bad">{t('This certificate has been revoked.')}</div> : <div className="alert ok">✓ {t('Valid certificate issued by AutoCare Garage Network.')}</div>}
    <div className="cert"><div className="mute">AutoCare Garage Network</div><h1 style={{ margin: '8px 0' }}>{t('Certificate of completion')}</h1><p>{t('This certifies that')}</p><h2 style={{ fontSize: '1.8rem', margin: '4px 0' }}>{c.full_name}</h2>
      <p>{t('has successfully completed the technical training program')}</p><h3 style={{ fontSize: '1.3rem' }}>{c.program}</h3><p className="mute">{c.branch} · {fdate(c.start_date)} – {fdate(c.end_date)}</p>
      <img src={qr} alt="QR" width="140" height="140" style={{ margin: '10px auto', display: 'block' }} /><div className="mute">{t('Certificate no.')} {c.code} · {t('issued')} {fdate(c.issued_at)}</div></div>
    <p className="noprint" style={{ textAlign: 'center', marginTop: 14 }}><PrintButton label={t('Print / save as PDF')} /></p></div>);
}
