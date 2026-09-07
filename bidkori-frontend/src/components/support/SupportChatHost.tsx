'use client';

import { usePathname } from 'next/navigation';

import SupportChat from '@/components/support/SupportChat';
import { shouldShowSupportChat } from '@/lib/supportChat';

/**
 * Single root-level host so public + Buyer/Seller share one in-memory session.
 * Hidden on Admin workspace paths.
 */
export default function SupportChatHost() {
  const pathname = usePathname();
  if (!shouldShowSupportChat(pathname)) {
    return null;
  }
  return <SupportChat />;
}
