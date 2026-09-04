-- DropForeignKey
ALTER TABLE "RosterImport" DROP CONSTRAINT "RosterImport_uploadedById_fkey";

-- AlterTable
ALTER TABLE "RosterImport" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "RosterImport" ADD CONSTRAINT "RosterImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
