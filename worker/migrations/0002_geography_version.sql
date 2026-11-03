-- Do not silently assign a geographic version to existing answers.
-- Historical rows require an explicit reviewed migration before a v2 release.
ALTER TABLE research_answers ADD COLUMN geography_version TEXT;
