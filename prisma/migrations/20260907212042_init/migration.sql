-- CreateEnum
CREATE TYPE "MenuItemType" AS ENUM ('texto', 'entrega', 'atendente', 'pergunta');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('bot_active', 'paused_human');

-- CreateEnum
CREATE TYPE "EntryPoint" AS ENUM ('menu', 'catalog');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "bot_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "bot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "welcome_message" TEXT NOT NULL,
    "menu_prompt" TEXT NOT NULL DEFAULT 'Como posso te ajudar hoje?',
    "delivery_prompt" TEXT NOT NULL,
    "delivery_wait_message" TEXT NOT NULL,
    "delivery_not_covered_message" TEXT NOT NULL DEFAULT 'Poxa, ainda não entregamos nessa região 💚',
    "delivery_unrecognized_message" TEXT NOT NULL DEFAULT 'Não consegui identificar essa região, vou te chamar um atendente!',
    "invalid_attempts_exceeded_message" TEXT NOT NULL DEFAULT 'Não consegui entender sua opção, vou te chamar um atendente!',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "type" "MenuItemType" NOT NULL,
    "reply" TEXT,
    "question" TEXT,
    "no_match_reply" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "delivery_locations" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "region_name" TEXT NOT NULL,
    "covered" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'bot_active',
    "entry_point" "EntryPoint",
    "invalid_attempts" INTEGER NOT NULL DEFAULT 0,
    "awaiting_delivery_reply" BOOLEAN NOT NULL DEFAULT false,
    "awaiting_menu_item_answer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "menu_item_answer_options" ADD CONSTRAINT "menu_item_answer_options_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_awaiting_menu_item_answer_id_fkey" FOREIGN KEY ("awaiting_menu_item_answer_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
