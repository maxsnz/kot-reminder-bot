-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('one_time', 'recurring');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('daily', 'weekly', 'monthly', 'yearly');

-- CreateEnum
CREATE TYPE "StatusKind" AS ENUM ('active', 'canceled', 'ended');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "AiRequestStatus" AS ENUM ('queued', 'processing', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatId" INTEGER NOT NULL,
    "focusId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "kind" "ScheduleKind" NOT NULL,
    "sourceText" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "timeSummary" TEXT NOT NULL DEFAULT '',
    "actionSummary" TEXT NOT NULL DEFAULT '',
    "emoji" TEXT,
    "status" "StatusKind" NOT NULL DEFAULT 'active',
    "runAtDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "runAtTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frequency" "ScheduleFrequency",
    "intervalStep" INTEGER NOT NULL DEFAULT 1,
    "startAtDate" TEXT,
    "endAtDate" TEXT,
    "timesOfDay" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "daysOfMonth" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "monthsOfYear" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "telegramMessageId" TEXT,
    "telegramReplyToId" TEXT,
    "role" "MessageRole" NOT NULL,
    "text" TEXT NOT NULL,
    "aiAction" JSONB,
    "scheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "focusId" TEXT,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Focus" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduleId" TEXT,

    CONSTRAINT "Focus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AiRequestStatus" NOT NULL DEFAULT 'queued',
    "prompt" JSONB,
    "responseText" TEXT,
    "responseJson" JSONB,
    "error" TEXT,
    "elapsedTime" INTEGER,
    "modelName" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "cost" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_chatId_key" ON "User"("chatId");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_scheduleId_idx" ON "ChatMessage"("scheduleId");

-- CreateIndex
CREATE INDEX "AiRequest_userId_createdAt_idx" ON "AiRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRequest_status_idx" ON "AiRequest"("status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_focusId_fkey" FOREIGN KEY ("focusId") REFERENCES "Focus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_focusId_fkey" FOREIGN KEY ("focusId") REFERENCES "Focus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Focus" ADD CONSTRAINT "Focus_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
