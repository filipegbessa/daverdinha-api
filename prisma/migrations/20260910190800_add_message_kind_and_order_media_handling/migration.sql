-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('text', 'invalid_content', 'order');

-- AlterTable
ALTER TABLE "bot_settings" ADD COLUMN     "media_received_message" TEXT NOT NULL DEFAULT 'Esse tipo de mensagem não é válido por aqui, vou te chamar um atendente!',
ADD COLUMN     "order_received_message" TEXT NOT NULL DEFAULT 'Aceito! Recebemos seu pedido, já vamos confirmar com você.';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "kind" "MessageKind" NOT NULL DEFAULT 'text';
