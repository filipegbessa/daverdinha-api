-- AlterEnum
ALTER TYPE "MenuItemType" ADD VALUE 'pergunta';

-- AlterTable
ALTER TABLE "bot_settings" ADD COLUMN     "delivery_not_covered_message" TEXT NOT NULL DEFAULT 'Poxa, ainda não entregamos nessa região 💚',
ADD COLUMN     "delivery_unrecognized_message" TEXT NOT NULL DEFAULT 'Não consegui identificar essa região, vou te chamar um atendente!',
ADD COLUMN     "invalid_attempts_exceeded_message" TEXT NOT NULL DEFAULT 'Não consegui entender sua opção, vou te chamar um atendente!',
ADD COLUMN     "menu_prompt" TEXT NOT NULL DEFAULT 'Como posso te ajudar hoje?';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "awaiting_menu_item_answer_id" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "no_match_reply" TEXT,
ADD COLUMN     "question" TEXT;

-- CreateTable
CREATE TABLE "menu_item_answer_options" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "keywords" TEXT[],
    "reply" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_item_answer_options_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "menu_item_answer_options" ADD CONSTRAINT "menu_item_answer_options_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_awaiting_menu_item_answer_id_fkey" FOREIGN KEY ("awaiting_menu_item_answer_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
