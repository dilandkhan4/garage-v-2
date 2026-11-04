import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { getSetting } from '@/lib/settings';
import { providerMode } from '@/lib/providers';
import Flash from '@/components/Flash';
import { saveSettings } from '@/actions/admin';
export const metadata = { title: 'Settings' };
export default async function Settings({ searchParams }) {
  const user = await requireUser(['manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const admin = user.role === 'admin';
  const [tax, labor, fee, gf] = await Promise.all([getSetting('tax_rate'), getSetting('labor_rate'), getSetting('delivery_fee'), getSetting('graduate_fields')]);
  const fields = [['name', 'Name'], ['photo', 'Photo'], ['headline', 'Headline'], ['skills', 'Skills'], ['certificate', 'Certificate (QR verified)'], ['branch', 'Branch trained at'], ['phone', 'Phone (never by default)']];
  return (<><h1>{t('Settings')}</h1><Flash sp={sp} t={t} />
    <div className="row" style={{ marginBottom: 12 }}><Link className="btn" href="/app/settings/parts">{t('Parts catalogue & prices')}</Link><Link className="btn" href="/app/settings/intervals">{t('Service intervals (manufacturer specs)')}</Link><Link className="btn" href="/app/training/programs">{t('Training programs')}</Link></div>
    {!admin && <div className="alert">{t('Managers can propose changes; the admin approves them. General settings are changed by the admin only.')}</div>}
    <form action={saveSettings} className="card f" style={{ maxWidth: 560 }}><h3>{t('Pricing and billing')}</h3>
      <label>{t('Tax rate (%) on invoices')}<input name="tax_rate" type="number" step="0.01" defaultValue={Number(tax)} disabled={!admin} /></label>
      <label>{t('Labor rate per hour (XAF)')}<input name="labor_rate" type="number" defaultValue={Number(labor)} disabled={!admin} /></label>
      <label>{t('Delivery fee (XAF)')}<input name="delivery_fee" type="number" defaultValue={Number(fee)} disabled={!admin} /></label>
      <h3>{t('Graduate details shown publicly')}</h3>
      {fields.map(([k, l]) => <label key={k} className="row" style={{ fontWeight: 400 }}><input type="checkbox" name={`gf_${k}`} defaultChecked={gf.includes(k)} disabled={!admin} /> {t(l)}</label>)}
      {admin && <button className="btn">{t('Save settings')}</button>}</form>
    <div className="card"><h3>{t('Providers')}</h3><p>{t('Messaging and payments are in {mode} mode.', { mode: providerMode() })} {providerMode() === 'test' ? t('Nothing is really sent or charged. Set PROVIDER_MODE=live and the provider keys listed in the README to go live.') : ''}</p></div></>);
}
