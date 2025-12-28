import { SendMessageInputSchema } from "../features/messages/usecases/sendMessage";
import { SyncMessagesInputSchema } from "../features/messages/usecases/syncMessages";
import { UpdateReadCursorInputSchema } from "../features/reads/usecases/updateReadCursor";
import type { AppServices } from "./compose";

export const makeHttpHandlers = (svc: AppServices) => ({
  // POST /messages/send
  sendMessage: async (body: unknown) => {
    const input = SendMessageInputSchema.parse(body);
    return svc.sendMessage(input);
  },

  // POST /messages/sync
  syncMessages: async (body: unknown) => {
    const input = SyncMessagesInputSchema.parse(body);
    return svc.syncMessages(input);
  },

  // POST /reads/update
  updateReadCursor: async (body: unknown) => {
    const input = UpdateReadCursorInputSchema.parse(body);
    return svc.updateReadCursor(input);
  },
});
