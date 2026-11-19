import { permanentRedirect } from 'next/navigation';

export default function DebtChatRedirectPage() {
  permanentRedirect('/chat?mode=debt');
}
