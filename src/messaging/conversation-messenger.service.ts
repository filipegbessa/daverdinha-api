import { Injectable } from '@nestjs/common';
import { MessageKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';

interface Recipient {
  id: string;
  phone: string;
}

/**
 * Every message the customer sees has to exist in two places: on WhatsApp
 * and in our own transcript (the admin's conversation view). Doing that by
 * hand at each call site is how the two drift apart — a branch that sends
 * without persisting leaves the operator reading a conversation with holes
 * in it. This service is the only place allowed to do either, so the pair
 * can't come apart.
 *
 * Being the only writer is also what makes `Conversation.unread` and
 * `Conversation.updatedAt` trustworthy: both are maintained here, in the
 * same transaction as the message they describe.
 */
@Injectable()
export class ConversationMessengerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppClientService,
  ) {}

  /** Sends a plain text reply and records it in the transcript. */
  async sendText(conversation: Recipient, body: string) {
    await this.whatsapp.sendText(conversation.phone, body);
    return this.persist(conversation.id, { direction: 'outbound', body });
  }

  /**
   * Sends the interactive menu. WhatsApp renders it as a tappable list, but
   * the transcript has no such widget — so it's recorded as the prompt
   * followed by one line per option, which is what the operator needs to
   * see to understand what the customer was choosing from.
   */
  async sendMenu(
    conversation: Recipient,
    promptText: string,
    buttonText: string,
    options: { id: string; title: string }[],
  ) {
    await this.whatsapp.sendInteractiveList(
      conversation.phone,
      promptText,
      buttonText,
      options,
    );
    return this.persist(conversation.id, {
      direction: 'outbound',
      body: [promptText, ...options.map((option) => `- ${option.title}`)].join(
        '\n',
      ),
    });
  }

  /** Records something the customer sent. Nothing is sent to WhatsApp. */
  recordInbound(
    conversationId: string,
    body: string | null,
    kind: MessageKind = 'text',
  ) {
    return this.persist(conversationId, { direction: 'inbound', kind, body });
  }

  /**
   * Writes the message and moves the conversation with it, atomically.
   *
   * `unread` mirrors "the last message is the customer's", which is what the
   * admin list used to work out by loading every conversation's last message
   * on every poll. `updatedAt` is touched because creating a related row
   * doesn't touch the parent on its own, and the list sorts by it — without
   * this, a conversation the bot just answered wouldn't move.
   */
  private async persist(
    conversationId: string,
    message: {
      direction: 'inbound' | 'outbound';
      body: string | null;
      kind?: MessageKind;
    },
  ) {
    const [created] = await this.prisma.$transaction([
      this.prisma.message.create({ data: { conversationId, ...message } }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { unread: message.direction === 'inbound' },
      }),
    ]);
    return created;
  }
}
