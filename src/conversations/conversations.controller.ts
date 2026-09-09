import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { ConversationsService } from './conversations.service';
import { ReplyDto } from './dto/reply.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Controller('conversations')
@UseGuards(ClerkAuthGuard)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getWithMessages(id);
  }

  @Patch(':id')
  updateName(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.service.updateName(id, dto.name);
  }

  @Post(':id/reply')
  reply(@Param('id') id: string, @Body() dto: ReplyDto) {
    return this.service.reply(id, dto.text);
  }

  @Post(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.service.reactivate(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.service.pause(id);
  }
}
