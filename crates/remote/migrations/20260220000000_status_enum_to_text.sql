-- Convert shared_tasks.status from ENUM task_status to TEXT
-- This allows arbitrary status strings from custom workflow schemes
ALTER TABLE shared_tasks
    ALTER COLUMN status TYPE TEXT
    USING status::text;

-- Drop the task_status ENUM type (no longer needed)
DROP TYPE task_status;
