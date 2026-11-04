import { setLang } from '@/actions/auth';
import ActBtn from '@/components/ActBtn';
export default function LangSwitch({ path = '/', locale }) {
  return (
    <form action={setLang} className="inline">
      <input type="hidden" name="path" value={path} />
      <ActBtn className="btn sm ghost" name="lang" value={locale === 'fr' ? 'en' : 'fr'}>{locale === 'fr' ? 'EN' : 'FR'}</ActBtn>
    </form>
  );
}
