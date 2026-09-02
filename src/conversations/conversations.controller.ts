import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { ConversationsService } from './conversations.service';

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
}
