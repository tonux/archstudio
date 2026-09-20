import type { Metadata } from 'next';
import HowItWorks from '@/components/howto/HowItWorks';
import './howto.css';
import { requirePage } from '@/lib/auth/guard';

export const metadata: Metadata = {
  title: 'How it works · ArchStudio',
  description: 'Layers, scopes, components, dependencies and flows — the whole format, on one worked example.'
};

/* Guarded like the rest. It shows a built-in demo and leaks nothing, but an
 * exception is a thing to explain forever, and "every page but one" is how a
 * second exception gets added later.
 *
 * `force-dynamic` is what makes that guard real. The content depends on
 * nothing, so without it Next prerenders the page at build time — `requirePage`
 * runs once, against no cookie, and the HTML it produced is then served to
 * everyone. The other guarded pages read the database and are dynamic anyway;
 * this one has to say so. */
export const dynamic = 'force-dynamic';
export default async function HowItWorksPage() {
  await requirePage();
  return <HowItWorks />;
}
