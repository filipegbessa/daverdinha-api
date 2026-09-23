import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { ConversationsService } from './conversations.service';
import { ReplyDto } from './dto/reply.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { ListMessagesDto } from './dto/list-messages.dto';

@Controller('conversations')
@UseGuards(ClerkAuthGuard)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Get()
  list(@Query() query: ListConversationsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getWithMessages(id);
  }

  @Get(':id/messages')
  listMessages(@Param('id') id: string, @Query() query: ListMessagesDto) {
    return this.service.listMessages(id, query);
  }

  /**
   * Devolve `{ url }`, não os bytes nem um redirect — ver `mediaUrl` no
   * service para o porquê (resumo: `<img>` não manda header de auth).
   */
  @Get(':id/messages/:messageId/media')
  mediaUrl(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Query('download') download?: string,
  ) {
    return this.service.mediaUrl(id, messageId, { download: download === '1' });
  }

  @Patch(':id')
  updateName(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.service.updateName(id, dto.name);
  }

  @Post(':id/reply')
  reply(@Param('id') id: string, @Body() dto: ReplyDto) {
    return this.service.reply(id, dto.text, dto.replyToMessageId);
  }

  @Post(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.service.reactivate(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.service.pause(id);
  }

  @Post(':id/categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  addCategory(
    @Param('id') id: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.service.addCategory(id, categoryId);
  }

  @Delete(':id/categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCategory(
    @Param('id') id: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.service.removeCategory(id, categoryId);
  }
}
