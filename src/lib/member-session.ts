import { cookies } from 'next/headers';
import { isMemberCookie, MEMBER_COOKIE } from '@/lib/member-auth';

/** Server-side: is the current request from a signed-in member? */
export async function isMember(): Promise<boolean> {
  const jar = await cookies();
  return isMemberCookie(jar.get(MEMBER_COOKIE)?.value);
}
