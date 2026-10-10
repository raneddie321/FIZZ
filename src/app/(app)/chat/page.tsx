import { ChatView } from "@/components/chat/chat-view";

export const metadata = { title: "New chat" };

export default function NewChatPage() {
  return <ChatView key="new" conversationId={null} />;
}
