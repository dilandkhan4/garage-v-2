export default function Flash({ sp, t }) {
  if (!sp) return null;
  return (<>
    {sp.ok && <div className="alert ok">{t(sp.ok)}</div>}
    {sp.err && <div className="alert bad">{t(sp.err)}</div>}
    {sp.tmp && <div className="alert">{t('New client account created. Temporary password (shown once):')} <b>{sp.tmp}</b></div>}
  </>);
}
