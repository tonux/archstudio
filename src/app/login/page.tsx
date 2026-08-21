import { redirect } from 'next/navigation';

import { authConfig } from '@/lib/auth/config';
import { currentPrincipal } from '@/lib/auth/guard';
import { countCredentials } from '@/lib/auth/store';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const config = authConfig();

  /* Nothing to sign in to, or already signed in: either way this page is not
   * where the person meant to be. */
  if (config.mode === 'off') redirect('/');
  if (await currentPrincipal()) redirect('/');

  return (
    <LoginForm
      mode={config.mode}
      emailHeader={config.emailHeader}
      /* A fresh install has to have a way in. The form turns into "create the
       * first account" rather than refusing everyone who arrives. */
      bootstrap={config.mode === 'local' && countCredentials() === 0}
    />
  );
}
