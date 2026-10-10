import { db, body, fail, initialize } from '@/lib/store';
import { requireUser } from '@/lib/auth';
import { normalizePreferences } from '@/lib/preferences';

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const data = await body(request);
    if (data.postcode !== undefined && typeof data.postcode !== 'string') throw new Error('Enter a six-digit Indian postcode or leave it blank.');
    const postcode = (data.postcode || '').trim();
    if (postcode && !/^\d{6}$/.test(postcode)) throw new Error('Enter a six-digit Indian postcode or leave it blank.');
    if (data.banks !== undefined && typeof data.banks !== 'string') throw new Error('Bank preferences must be text.');
    await initialize(user.id);
    const row = await db().prepare('SELECT settings FROM workspace WHERE id=?').bind(user.id).first() as any;
    const previous = row ? JSON.parse(row.settings).profile || {} : {};
    const preferences = normalizePreferences({ ...previous, ...data });
    const profile = { ...previous, postcode: data.postcode === undefined ? previous.postcode || '' : postcode,
      banks: data.banks === undefined ? previous.banks || '' : (data.banks || '').trim().slice(0,200),
      ...preferences, condition: 'New only', country: 'India', currency: 'INR' };
    await db().prepare("UPDATE workspace SET settings=json_set(settings,'$.profile',json(?)) WHERE id=?")
      .bind(JSON.stringify(profile),user.id).run();
    return Response.json({ ok: true, profile });
  } catch (error) { return fail(error); }
}
