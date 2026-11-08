-- Team roles: the Captain seat can be empty.
-- teams.captain_id was declared NOT NULL back when the Captain was a clan's only
-- leader. With the President / Coach / Captain model a clan legitimately has no
-- Captain: the Captain may leave (POST /teams/:id/leave) or become the new
-- President (POST /teams/:id/transfer). Both paths null the seat out, which the
-- NOT NULL constraint rejected, so leaving a clan as its Captain failed with a
-- not-null violation and the whole leave transaction rolled back.
ALTER TABLE "teams" ALTER COLUMN "captain_id" DROP NOT NULL;

