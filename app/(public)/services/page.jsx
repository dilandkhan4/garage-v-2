import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
export const metadata = { title: 'Services' };
export default async function Services() {
  const t = await getT(await getUser());
  const items = [
    ['Oil & filter service', 'Engine oil and filter changes to the manufacturer’s schedule.'],
    ['Brakes', 'Pads, discs, fluid and inspection.'],
    ['Engine & electrical diagnostics', 'Fault finding with written findings and a quote.'],
    ['Tyres, alignment & suspension', 'Fitting, balancing, alignment and repairs.'],
    ['Battery & electrics', 'Testing and replacement.'],
    ['Bodywork', 'Dent, paint and panel repair.'],
    ['Towing & roadside help', 'Book a tow or roadside assistance.'],
    ['Pickup & delivery of your vehicle', 'We collect your vehicle and bring it back.'],
  ];
  return (<div className="wrap" style={{ paddingTop: 24 }}><h1>{t('Services')}</h1>
    <div className="grid g3">{items.map(([h, p]) => <div className="card" key={h}><h3>{t(h)}</h3><p className="mute">{t(p)}</p></div>)}</div>
    <Link className="btn alt" href="/register">{t('Register and book')}</Link></div>);
}
