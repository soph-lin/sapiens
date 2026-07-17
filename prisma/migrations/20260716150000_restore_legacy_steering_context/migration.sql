-- Restore the complete remembered legacy steering payloads as serialized JSON text.
-- StoryGenRun.steering is TEXT for new runs, but retaining the full legacy object here
-- preserves both historicalEvent and synopsisDirection without dropping context.
UPDATE "StoryGenRun"
SET "steering" = '{"historicalEvent":"The Apollo 11 Moon landing","synopsisDirection":"I talk with a mission-control engineer as the team responds to a dangerous technical problem."}'
WHERE "steering" = 'The Apollo 11 Moon landing';

UPDATE "StoryGenRun"
SET "steering" = '{"historicalEvent":"Rosa Parks refusing to move from bus","synopsisDirection":"I see Rosa Parks refuse to move, and I talk to her"}'
WHERE "steering" = 'Rosa Parks refusing to move from bus';
