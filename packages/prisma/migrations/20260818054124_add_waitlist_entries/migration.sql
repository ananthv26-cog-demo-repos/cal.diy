-- CreateEnum
CREATE TYPE "public"."WaitlistEntryStatus" AS ENUM ('PENDING', 'OFFERED', 'CLAIMED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."EventType" ADD COLUMN     "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waitlistMaxSize" INTEGER;

-- CreateTable
CREATE TABLE "public"."WaitlistEntry" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "eventTypeId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "attendeeName" TEXT NOT NULL,
    "attendeeEmail" TEXT NOT NULL,
    "attendeeTimeZone" TEXT NOT NULL,
    "responses" JSONB,
    "status" "public"."WaitlistEntryStatus" NOT NULL DEFAULT 'PENDING',
    "offerToken" TEXT,
    "offeredAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "claimedBookingId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_uid_key" ON "public"."WaitlistEntry"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_offerToken_key" ON "public"."WaitlistEntry"("offerToken");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_claimedBookingId_key" ON "public"."WaitlistEntry"("claimedBookingId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_eventTypeId_startTime_status_createdAt_idx" ON "public"."WaitlistEntry"("eventTypeId", "startTime", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_eventTypeId_startTime_attendeeEmail_key" ON "public"."WaitlistEntry"("eventTypeId", "startTime", "attendeeEmail");

-- AddForeignKey
ALTER TABLE "public"."WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "public"."EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "WaitlistEntry_single_active_offer" ON "WaitlistEntry" ("eventTypeId", "startTime") WHERE "status" = 'OFFERED';
