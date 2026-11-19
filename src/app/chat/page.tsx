import type { Metadata } from 'next';
import { TransactionChat } from '@/components/TransactionChat';

export const metadata: Metadata = {
  title: 'Ghi nhanh ARC',
  manifest: '/ghi-nhanh.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Ghi nhanh' },
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const initialMode = params?.mode === 'debt' ? 'debt' : 'auto';
  return <TransactionChat initialMode={initialMode} />;
}
