import { memberSigninAvailable } from '@/lib/member-auth';

/**
 * Neutral gate notice, rendered with status 200 in place of members-only pages.
 * `next` is where to land after sign-in; `error` shows the failed-password line.
 */
export function MembersOnly({
  next,
  error = false,
  available = memberSigninAvailable(),
}: {
  next: string;
  error?: boolean;
  available?: boolean;
}) {
  return (
    <main className="container members-only">
      <h1>Members only</h1>
      <p className="members-lede">
        This section is available to members. Sign in with the member password to continue.
      </p>
      {available ? (
        <>
          {error ? (
            <p className="members-error" role="alert">
              {"That password didn't work."}
            </p>
          ) : null}
          <form method="post" action="/api/member/login" className="members-form">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="member-password" className="members-label">
              Member password
            </label>
            <input
              id="member-password"
              className="members-input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
            <button type="submit" className="members-submit">
              Sign in
            </button>
          </form>
        </>
      ) : (
        <p className="brief-meta">Member sign-in is not available right now.</p>
      )}
    </main>
  );
}
