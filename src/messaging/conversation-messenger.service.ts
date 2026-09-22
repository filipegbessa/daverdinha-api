import { BadRequestException, Injectable } from '@nestjs/common';
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

  /**
   * Sends a plain text reply and records it in the transcript.
   *
   * With `options.replyToMessageId`, this sends a WhatsApp quoted reply:
   * the target message has to belong to this same conversation (otherwise
   * an operator could cite a message from someone else's thread) and has
   * to have its own `whatsappMessageId` (you can't quote a message that
   * never made it to WhatsApp). The target's id and wamid are already in
   * hand at that point, so they're written straight onto the new message
   * without a second lookup.
   */
  async sendText(
    conversation: Recipient,
    body: string,
    options?: { replyToMessageId?: string },
  ) {
    if (options?.replyToMessageId) {
      const target = await this.prisma.message.findUnique({
        where: {
          id: options.replyToMessageId,
          conversationId: conversation.id,
        },
      });
      if (!target || !target.whatsappMessageId) {
        throw new BadRequestException(
          'Não é possível responder citando esta mensagem.',
        );
      }

      const { whatsappMessageId } = await this.whatsapp.sendText(
        conversation.phone,
        body,
        { replyToWamid: target.whatsappMessageId },
      );
      return this.persist(conversation.id, {
        direction: 'outbound',
        body,
        whatsappMessageId,
        repliedToId: options.replyToMessageId,
        repliedToWamid: target.whatsappMessageId,
      });
    }

    const { whatsappMessageId } = await this.whatsapp.sendText(
      conversation.phone,
      body,
    );
    return this.persist(conversation.id, {
      direction: 'outbound',
      body,
      whatsappMessageId,
    });
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
    const { whatsappMessageId } = await this.whatsapp.sendInteractiveList(
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
      whatsappMessageId,
    });
  }

  /**
   * Records something the customer sent. Nothing is sent to WhatsApp.
   *
   * When `options.repliedToWamid` is present, this resolves it to our own
   * message id by looking it up globally (`whatsappMessageId` is unique
   * across the whole table, so there's no need to scope by conversation).
   * A miss isn't an error — WhatsApp will still report a reply even if the
   * quoted message is older than our retention, or arrived before this
   * feature existed — it's just recorded without a `repliedToId`, and the
   * frontend shows a generic "replying to an earlier message" notice for
   * that case.
   */
  async recordInbound(
    conversationId: string,
    body: string | null,
    kind: MessageKind = 'text',
    options?: { whatsappMessageId?: string; repliedToWamid?: string },
  ) {
    let repliedToId: string | undefined;
    if (options?.repliedToWamid) {
      const target = await this.prisma.message.findFirst({
        where: { whatsappMessageId: options.repliedToWamid },
      });
      repliedToId = target?.id;
    }

    return this.persist(conversationId, {
      direction: 'inbound',
      kind,
      body,
      whatsappMessageId: options?.whatsappMessageId,
      repliedToWamid: options?.repliedToWamid,
      repliedToId,
    });
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
      whatsappMessageId?: string;
      repliedToWamid?: string;
      repliedToId?: string;
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
