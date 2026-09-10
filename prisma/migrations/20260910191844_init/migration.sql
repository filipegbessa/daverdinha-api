-- CreateEnum
CREATE TYPE "MenuItemType" AS ENUM ('texto', 'entrega', 'atendente', 'pergunta');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('bot_active', 'paused_human');

-- CreateEnum
CREATE TYPE "EntryPoint" AS ENUM ('menu', 'catalog');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('text', 'invalid_content', 'order');

-- CreateTable
CREATE TABLE "bot_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "bot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "welcome_message" TEXT NOT NULL,
    "invalid_attempts_exceeded_message" TEXT NOT NULL DEFAULT 'Não consegui entender sua opção, vou te chamar um atendente!',
    "media_received_message" TEXT NOT NULL DEFAULT 'Esse tipo de mensagem não é válido por aqui!',
    "order_received_message" TEXT NOT NULL DEFAULT 'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "type" "MenuItemType" NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "reply" TEXT,
    "question" TEXT,
    "no_match_reply" TEXT,
    "delivery_prompt" TEXT,
    "delivery_retry_message" TEXT,
    "delivery_confirmed_message" TEXT,
    "delivery_not_covered_message" TEXT,
    "delivery_unrecognized_message" TEXT,
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
CREATE TABLE "cep_ranges" (
    "id" SERIAL NOT NULL,
    "start_cep" INTEGER NOT NULL,
    "end_cep" INTEGER NOT NULL,
    "delivery_location_id" TEXT NOT NULL,

    CONSTRAINT "cep_ranges_pkey" PRIMARY KEY ("id")
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
    "kind" "MessageKind" NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_locations_region_name_key" ON "delivery_locations"("region_name");

-- CreateIndex
CREATE INDEX "cep_ranges_start_cep_end_cep_idx" ON "cep_ranges"("start_cep", "end_cep");

-- AddForeignKey
ALTER TABLE "menu_item_answer_options" ADD CONSTRAINT "menu_item_answer_options_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cep_ranges" ADD CONSTRAINT "cep_ranges_delivery_location_id_fkey" FOREIGN KEY ("delivery_location_id") REFERENCES "delivery_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_awaiting_menu_item_answer_id_fkey" FOREIGN KEY ("awaiting_menu_item_answer_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
