-- Fix task_status_transition_history schema to use BLOB for foreign keys
-- This ensures SQLite properly validates foreign key constraints
DROP TABLE IF EXISTS task_status_transition_history;

CREATE TABLE task_status_transition_history (
    id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
    task_id BLOB NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    triggered_by TEXT NOT NULL CHECK (triggered_by IN ('Human', 'Auto')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_transitions_by_task ON task_status_transition_history(task_id, created_at DESC);
