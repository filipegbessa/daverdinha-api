-- CreateEnum
CREATE TYPE "MenuItemType" AS ENUM ('texto', 'entrega', 'atendente');

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
    "delivery_prompt" TEXT NOT NULL,
    "delivery_wait_message" TEXT NOT NULL,
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
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
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
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
