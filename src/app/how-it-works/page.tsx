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
 * second exception gets added later. */
export default async function HowItWorksPage() {
  await requirePage();
  return <HowItWorks />;
}
