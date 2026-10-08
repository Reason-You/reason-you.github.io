import type { Metadata } from 'next';
import LookUpSky from '@/components/sky/LookUpSky';

export const metadata: Metadata = {
  title: 'Stars Above',
  description: 'A quiet window onto the real southern sky.',
};

export default function LookUpPage() {
  return <LookUpSky />;
}
