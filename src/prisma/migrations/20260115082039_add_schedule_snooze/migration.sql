-- CreateTable
CREATE TABLE "ScheduleSnooze" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleSnooze_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleSnooze_scheduleId_idx" ON "ScheduleSnooze"("scheduleId");

-- CreateIndex
CREATE INDEX "ScheduleSnooze_userId_idx" ON "ScheduleSnooze"("userId");

-- CreateIndex
CREATE INDEX "ScheduleSnooze_runAt_idx" ON "ScheduleSnooze"("runAt");

-- AddForeignKey
ALTER TABLE "ScheduleSnooze" ADD CONSTRAINT "ScheduleSnooze_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSnooze" ADD CONSTRAINT "ScheduleSnooze_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
