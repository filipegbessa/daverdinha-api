-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('bot_active', 'paused_human');

-- CreateEnum
CREATE TYPE "EntryPoint" AS ENUM ('menu', 'catalog');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('text', 'invalid_content', 'order', 'image', 'audio');

-- CreateEnum
CREATE TYPE "SiteOrderStatus" AS ENUM ('pending_payment', 'paid', 'expired', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('awaiting', 'preparing', 'ready', 'completed');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('pickup', 'delivery');

-- CreateEnum
CREATE TYPE "SiteOrderKind" AS ENUM ('products', 'tickets');

-- CreateTable
CREATE TABLE "bot_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "bot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "welcome_message" TEXT NOT NULL,
    "invalid_attempts_exceeded_message" TEXT NOT NULL DEFAULT 'Não consegui entender sua opção, vou te chamar um atendente!',
    "media_received_message" TEXT NOT NULL DEFAULT 'Esse tipo de mensagem não é válido por aqui!',
    "order_received_message" TEXT NOT NULL DEFAULT 'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
    "media_bytes_used" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "reply" TEXT,
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
CREATE TABLE "delivery_locations" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "region_name" TEXT NOT NULL,
    "covered" BOOLEAN NOT NULL DEFAULT true,
    "area_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_areas" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_areas_pkey" PRIMARY KEY ("id")
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
    "unread" BOOLEAN NOT NULL DEFAULT false,
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
    "body" TEXT,
    "media_key" TEXT,
    "media_mime_type" TEXT,
    "media_size_bytes" INTEGER,
    "whatsapp_message_id" TEXT,
    "replied_to_wamid" TEXT,
    "replied_to_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "catalog_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_retailer_id" TEXT NOT NULL,
    "product_name" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2),
    "currency" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhook_messages" (
    "whatsapp_message_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_messages_pkey" PRIMARY KEY ("whatsapp_message_id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_categories" (
    "conversation_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_categories_pkey" PRIMARY KEY ("conversation_id","category_id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "images" TEXT[],
    "category_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER,
    "lead_time_days" INTEGER,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_orders" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "public_token" TEXT NOT NULL,
    "kind" "SiteOrderKind" NOT NULL DEFAULT 'products',
    "status" "SiteOrderStatus" NOT NULL DEFAULT 'pending_payment',
    "fulfillment_status" "FulfillmentStatus" NOT NULL DEFAULT 'awaiting',
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "delivery_method" "DeliveryMethod",
    "cep" TEXT,
    "street" TEXT,
    "street_number" TEXT,
    "complement" TEXT,
    "bairro" TEXT,
    "delivery_zone" TEXT,
    "delivery_area" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "delivery_fee" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "gateway_link_id" TEXT,
    "gateway_order_id" TEXT,
    "gateway_charge_id" TEXT,
    "gateway_status" TEXT,
    "payment_url" TEXT,
    "paid_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "product_slug" TEXT,
    "image_url" TEXT,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lead_time_days" INTEGER,

    CONSTRAINT "site_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pickup_address" TEXT NOT NULL,
    "pickup_hours" TEXT NOT NULL,
    "pickup_instructions" TEXT,
    "max_installments" INTEGER NOT NULL DEFAULT 3,
    "min_installment_value" DECIMAL(10,2) NOT NULL DEFAULT 30,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_locations_region_name_key" ON "delivery_locations"("region_name");

-- CreateIndex
CREATE INDEX "delivery_locations_area_id_idx" ON "delivery_locations"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_areas_zone_name_key" ON "delivery_areas"("zone", "name");

-- CreateIndex
CREATE INDEX "cep_ranges_start_cep_end_cep_idx" ON "cep_ranges"("start_cep", "end_cep");

-- CreateIndex
CREATE INDEX "conversations_updated_at_idx" ON "conversations"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_phone_idx" ON "conversations"("phone");

-- CreateIndex
CREATE INDEX "conversations_unread_idx" ON "conversations"("unread");

-- CreateIndex
CREATE UNIQUE INDEX "messages_whatsapp_message_id_key" ON "messages"("whatsapp_message_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_message_id_key" ON "orders"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_slug_key" ON "product_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_active_order_idx" ON "products"("active", "order");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_orders_number_key" ON "site_orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "site_orders_public_token_key" ON "site_orders"("public_token");

-- CreateIndex
CREATE UNIQUE INDEX "site_orders_gateway_link_id_key" ON "site_orders"("gateway_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_orders_gateway_order_id_key" ON "site_orders"("gateway_order_id");

-- CreateIndex
CREATE INDEX "site_orders_kind_status_created_at_idx" ON "site_orders"("kind", "status", "created_at");

-- CreateIndex
CREATE INDEX "site_order_items_order_id_idx" ON "site_order_items"("order_id");

-- CreateIndex
CREATE INDEX "site_order_items_product_id_idx" ON "site_order_items"("product_id");

-- AddForeignKey
ALTER TABLE "delivery_locations" ADD CONSTRAINT "delivery_locations_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "delivery_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cep_ranges" ADD CONSTRAINT "cep_ranges_delivery_location_id_fkey" FOREIGN KEY ("delivery_location_id") REFERENCES "delivery_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_replied_to_id_fkey" FOREIGN KEY ("replied_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_categories" ADD CONSTRAINT "conversation_categories_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_categories" ADD CONSTRAINT "conversation_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_order_items" ADD CONSTRAINT "site_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "site_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_order_items" ADD CONSTRAINT "site_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

