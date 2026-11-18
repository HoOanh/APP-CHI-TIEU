import type { Metadata } from 'next';
import { TransactionChat } from '@/components/TransactionChat';

export const metadata: Metadata = {
  title: 'Ghi nhanh ARC',
  manifest: '/ghi-nhanh.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Ghi nhanh' },
};

export default function ChatPage() {
  return <TransactionChat />;
}
