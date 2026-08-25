-- Make tournament start_date nullable so active tournaments can be created without a date.
ALTER TABLE "tournaments" ALTER COLUMN "start_date" DROP NOT NULL;