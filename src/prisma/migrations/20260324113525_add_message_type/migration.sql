-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('snooze_prompt');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "messageType" "MessageType";

-- CreateIndex
CREATE INDEX "ChatMessage_telegramMessageId_telegramChatId_idx" ON "ChatMessage"("telegramMessageId", "telegramChatId");
