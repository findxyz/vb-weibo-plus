export function createConversationSession() {
  return {
    messages: new Map(),
    version: 0
  };
}
