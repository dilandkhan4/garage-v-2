import { redirect } from 'next/navigation';
import { back } from './util';
export class Fail extends Error {}
export const fail = (msg) => { throw new Fail(msg); };
// Runs fn; if it throws Fail, redirects to `path` with the message. Other errors propagate (including Next redirects).
export async function guard(path, fn) {
  try { return await fn(); } catch (e) { if (e instanceof Fail) redirect(back(path, 'err', e.message)); throw e; }
}
