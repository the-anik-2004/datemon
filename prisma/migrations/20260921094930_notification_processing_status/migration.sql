ALTER TYPE "NotificationStatus" ADD VALUE 'PROCESSING';

ALTER TABLE "Notification" ADD COLUMN "error" TEXT;
