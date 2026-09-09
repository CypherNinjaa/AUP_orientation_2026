-- AlterTable
ALTER TABLE "Registration" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "accessSecret" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text);

-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT IF EXISTS "Registration_userId_fkey";

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
