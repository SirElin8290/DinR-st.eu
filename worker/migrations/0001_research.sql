-- Additive migration. Legacy tables remain untouched and are never silently imported.
PRAGMA foreign_keys=ON;
CREATE TABLE research_methods (
 id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)), created_at TEXT NOT NULL
);
CREATE TABLE research_questions (
 id TEXT PRIMARY KEY, category TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE research_versions (
 id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES research_questions(id), version INTEGER NOT NULL CHECK(version>0),
 wording TEXT NOT NULL, context TEXT NOT NULL, options_json TEXT NOT NULL CHECK(json_valid(options_json)),
 comparison_key TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(question_id,version)
);
CREATE TABLE research_waves (
 id TEXT PRIMARY KEY, opens_at TEXT NOT NULL, closes_at TEXT NOT NULL, timezone TEXT NOT NULL CHECK(timezone='Europe/Stockholm'),
 method_id TEXT NOT NULL REFERENCES research_methods(id), status TEXT NOT NULL CHECK(status IN ('draft','open','closed')),
 CHECK(opens_at<closes_at)
);
CREATE TABLE research_items (
 id TEXT PRIMARY KEY, wave_id TEXT NOT NULL REFERENCES research_waves(id), version_id TEXT NOT NULL REFERENCES research_versions(id),
 position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8), category TEXT NOT NULL,
 sponsor TEXT, editorial_review TEXT NOT NULL DEFAULT 'pending' CHECK(editorial_review IN ('pending','approved','rejected')),
 UNIQUE(wave_id,position), UNIQUE(wave_id,category), UNIQUE(wave_id,version_id)
);
CREATE TABLE research_participants (
 user_id TEXT PRIMARY KEY, verification TEXT NOT NULL CHECK(verification IN ('self_reported','email_verified','identity_verified','mock')),
 age_band TEXT NOT NULL CHECK(age_band IN ('16-17','18-29','30-49','50-64','65+','unknown')),
 gender TEXT NOT NULL CHECK(gender IN ('woman','man','other','not_stated')),
 municipality_code TEXT, region_code TEXT, geography_source TEXT NOT NULL DEFAULT 'self_reported',
 recruitment TEXT NOT NULL CHECK(recruitment IN ('dinpuls','political_group','university','public_event','direct','unknown')),
 consent_version TEXT NOT NULL, consented_at TEXT NOT NULL, withdrawn_at TEXT
);
CREATE TABLE research_reviews (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES research_items(id),
 decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')), reviewer TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER immutable_review_update BEFORE UPDATE ON research_reviews BEGIN SELECT RAISE(ABORT,'immutable review'); END;
CREATE TRIGGER immutable_review_delete BEFORE DELETE ON research_reviews BEGIN SELECT RAISE(ABORT,'immutable review'); END;
CREATE TABLE research_receipts (
 user_id TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES research_items(id), PRIMARY KEY(user_id,item_id)
);
-- No direct identity, session, exact timestamp, or participant key in answer rows.
CREATE TABLE research_answers (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES research_items(id), option_id TEXT NOT NULL,
 received_week TEXT NOT NULL, age_band TEXT NOT NULL, gender TEXT NOT NULL,
 municipality_code TEXT, region_code TEXT, geography_source TEXT NOT NULL,
 verification TEXT NOT NULL, recruitment TEXT NOT NULL, consent_version TEXT NOT NULL,
 quality TEXT NOT NULL CHECK(quality IN ('accepted','quarantined'))
);
CREATE INDEX research_answers_item ON research_answers(item_id,quality);
-- Participant holds a random capability; only its digest is persisted separately.
-- Enables removal without storing a stable per-person answer key.
CREATE TABLE research_erasures (token_hash TEXT PRIMARY KEY, answer_id TEXT NOT NULL UNIQUE REFERENCES research_answers(id) ON DELETE CASCADE);
CREATE TABLE research_releases (
 id TEXT PRIMARY KEY, wave_id TEXT NOT NULL UNIQUE REFERENCES research_waves(id),
 created_at TEXT NOT NULL, reviewer TEXT NOT NULL, policy_version TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), sha256 TEXT NOT NULL
);
CREATE TABLE research_release_notices (
 id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES research_releases(id),
 kind TEXT NOT NULL CHECK(kind IN ('correction','withdrawal')), note TEXT NOT NULL,
 reviewer TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER immutable_notice_update BEFORE UPDATE ON research_release_notices BEGIN SELECT RAISE(ABORT,'immutable notice'); END;
CREATE TRIGGER immutable_notice_delete BEFORE DELETE ON research_release_notices BEGIN SELECT RAISE(ABORT,'immutable notice'); END;
CREATE TRIGGER immutable_method_update BEFORE UPDATE ON research_methods BEGIN SELECT RAISE(ABORT,'immutable method'); END;
CREATE TRIGGER immutable_method_delete BEFORE DELETE ON research_methods BEGIN SELECT RAISE(ABORT,'immutable method'); END;
CREATE TRIGGER immutable_version_update BEFORE UPDATE ON research_versions BEGIN SELECT RAISE(ABORT,'immutable version'); END;
CREATE TRIGGER immutable_version_delete BEFORE DELETE ON research_versions BEGIN SELECT RAISE(ABORT,'immutable version'); END;
CREATE TRIGGER closed_wave_update BEFORE UPDATE ON research_waves WHEN OLD.status='closed' BEGIN SELECT RAISE(ABORT,'closed wave'); END;
CREATE TRIGGER open_wave_metadata BEFORE UPDATE ON research_waves WHEN OLD.status='open' AND (NEW.id!=OLD.id OR NEW.opens_at!=OLD.opens_at OR NEW.closes_at!=OLD.closes_at OR NEW.method_id!=OLD.method_id OR NEW.timezone!=OLD.timezone OR NEW.status NOT IN ('open','closed')) BEGIN SELECT RAISE(ABORT,'locked wave metadata'); END;
CREATE TRIGGER used_wave_delete BEFORE DELETE ON research_waves WHEN OLD.status!='draft' BEGIN SELECT RAISE(ABORT,'locked wave'); END;
CREATE TRIGGER locked_item_update BEFORE UPDATE ON research_items WHEN (SELECT status FROM research_waves WHERE id=OLD.wave_id)!='draft' BEGIN SELECT RAISE(ABORT,'locked item'); END;
CREATE TRIGGER locked_item_delete BEFORE DELETE ON research_items WHEN (SELECT status FROM research_waves WHERE id=OLD.wave_id)!='draft' BEGIN SELECT RAISE(ABORT,'locked item'); END;
CREATE TRIGGER locked_item_insert BEFORE INSERT ON research_items WHEN (SELECT status FROM research_waves WHERE id=NEW.wave_id)!='draft' BEGIN SELECT RAISE(ABORT,'locked item'); END;
CREATE TRIGGER open_wave_check BEFORE UPDATE OF status ON research_waves WHEN NEW.status='open' BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM research_items WHERE wave_id=NEW.id AND editorial_review='approved')!=8 THEN RAISE(ABORT,'eight approved questions required') END;
END;
CREATE TRIGGER draft_wave_insert BEFORE INSERT ON research_waves WHEN NEW.status!='draft' BEGIN SELECT RAISE(ABORT,'start in draft'); END;
CREATE TRIGGER immutable_release_update BEFORE UPDATE ON research_releases BEGIN SELECT RAISE(ABORT,'immutable release'); END;
CREATE TRIGGER immutable_release_delete BEFORE DELETE ON research_releases BEGIN SELECT RAISE(ABORT,'immutable release'); END;
CREATE TRIGGER answer_option_check BEFORE INSERT ON research_answers BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM research_items i JOIN research_versions v ON v.id=i.version_id,json_each(v.options_json) o WHERE i.id=NEW.item_id AND json_extract(o.value,'$.id')=NEW.option_id) THEN RAISE(ABORT,'invalid option') END;
END;
