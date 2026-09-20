import { requirePage } from '@/lib/auth/guard';
import AdminShell from '@/components/admin/AdminShell';

/* A server component whose only job is the guard.
 *
 * The shell underneath is a client component — it owns the nav, the theme
 * toggle and the locale switch — and a client component cannot read the
 * session, so it could not be the thing that checks. Everything under /admin
 * edits the catalogs the rest of the workspace is built from, and the pages
 * are client-rendered too, so without a check at the layout there is no point
 * on the page side where one happens.
 *
 * `force-dynamic` because the answer depends on a cookie: a statically
 * rendered admin shell would be served to anyone, and the redirect would never
 * run.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePage();
  return <AdminShell>{children}</AdminShell>;
}
