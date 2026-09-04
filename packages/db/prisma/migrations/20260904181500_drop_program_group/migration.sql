-- Drop the derived programme-group column.
--
-- `AdmittedStudent.programGroup` held a normalised discipline bucket
-- ('Engineering', 'Law', 'Management', …) derived from the free-text `program`
-- by a regex table in packages/core/src/roster/programs.ts. It existed so that
-- admin charts had something with eleven values to group by instead of the 35
-- distinct spellings in the sheet.
--
-- Removed on instruction: the registration lookup must return the actual
-- programme the sheet gives, and a grouped label is not that. Nothing derived
-- may stand in for `program` anywhere a human reads it — not the wizard, not the
-- pass, not the scanner.
--
-- The 830 values being dropped are recomputable from `program` at any time, so
-- this loses no information. Charts now group by `program` itself, which is why
-- an index moves onto that column: the distribution has a longer tail, and it is
-- the truth rather than a summary of it.
--
-- `programLevel` (UG / PG / PHD) is deliberately kept. It is not a renaming of
-- the programme, it is a separate fact about it, and the arrivals breakdown and
-- the Excel export both want it.

-- DropIndex
DROP INDEX "AdmittedStudent_programGroup_idx";

-- AlterTable
ALTER TABLE "AdmittedStudent" DROP COLUMN "programGroup";

-- CreateIndex
CREATE INDEX "AdmittedStudent_program_idx" ON "AdmittedStudent"("program");
