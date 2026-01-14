-- Create workflow_schemes table
-- Stores workflow configurations with JSON columns for flexibility
CREATE TABLE workflow_schemes (
    id BLOB PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    statuses TEXT NOT NULL,          -- JSON: Vec<WorkflowStatus>
    transitions TEXT NOT NULL,       -- JSON: Vec<WorkflowTransition>
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Create index for default scheme lookup
CREATE INDEX idx_workflow_schemes_is_default ON workflow_schemes(is_default);

-- Add workflow_scheme_id to projects table
ALTER TABLE projects ADD COLUMN workflow_scheme_id BLOB REFERENCES workflow_schemes(id);

-- Add workflow_status to tasks table (NEW approach: store status name as string)
-- This allows scheme changes without complex migrations
ALTER TABLE tasks ADD COLUMN workflow_status TEXT;

-- Seed the default workflow scheme with legacy 5 statuses
-- Using a fixed UUID for the default scheme: 00000000-0000-0000-0000-000000000001
INSERT INTO workflow_schemes (id, name, description, is_default, statuses, transitions)
VALUES (
    X'00000000000000000000000000000001',
    'Default Workflow',
    'Standard Kanban workflow with Todo, In Progress, In Review, Done, and Cancelled statuses',
    1,
    '[
      {
        "name": "todo",
        "display_name": "To Do",
        "color": "var(--neutral-foreground)",
        "position": 0,
        "is_initial": true,
        "is_terminal": false,
        "agent_config": null,
        "automated_actions": []
      },
      {
        "name": "inprogress",
        "display_name": "In Progress",
        "color": "var(--info)",
        "position": 1,
        "is_initial": false,
        "is_terminal": false,
        "agent_config": null,
        "automated_actions": []
      },
      {
        "name": "inreview",
        "display_name": "In Review",
        "color": "var(--warning)",
        "position": 2,
        "is_initial": false,
        "is_terminal": false,
        "agent_config": null,
        "automated_actions": []
      },
      {
        "name": "done",
        "display_name": "Done",
        "color": "var(--success)",
        "position": 3,
        "is_initial": false,
        "is_terminal": true,
        "agent_config": null,
        "automated_actions": []
      },
      {
        "name": "cancelled",
        "display_name": "Cancelled",
        "color": "var(--destructive)",
        "position": 4,
        "is_initial": false,
        "is_terminal": true,
        "agent_config": null,
        "automated_actions": []
      }
    ]',
    '[
      {"from_status": "todo", "to_status": "inprogress", "button_label": "Start", "button_variant": null, "requires_feedback": false, "feedback_prompt": null, "pre_actions": [], "post_actions": []},
      {"from_status": "inprogress", "to_status": "todo", "button_label": "Move to To Do", "button_variant": null, "requires_feedback": false, "feedback_prompt": null, "pre_actions": [], "post_actions": []},
      {"from_status": "inprogress", "to_status": "inreview", "button_label": "Submit for Review", "button_variant": null, "requires_feedback": false, "feedback_prompt": null, "pre_actions": [], "post_actions": []},
      {"from_status": "inprogress", "to_status": "done", "button_label": "Mark Done", "button_variant": null, "requires_feedback": false, "feedback_prompt": null, "pre_actions": [], "post_actions": []},
      {"from_status": "inreview", "to_status": "inprogress", "button_label": "Request Changes", "button_variant": null, "requires_feedback": false, "feedback_prompt": null, "pre_actions": [], "post_actions": []},
      {"from_status": "inreview", "to_status": "done", "button_label": "Approve", "button_variant": null, "requires_feedback": false, "feedback_prompt": null, "pre_actions": [], "post_actions": []},
      {"from_status": "done", "to_status": "inprogress", "button_label": "Reopen", "button_variant": null, "requires_feedback": false, "feedback_prompt": null, "pre_actions": [], "post_actions": []},
      {"from_status": "cancelled", "to_status": "todo", "button_label": "Restore", "button_variant": null, "requires_feedback": false, "feedback_prompt": null, "pre_actions": [], "post_actions": []},
      {"from_status": "*", "to_status": "cancelled", "button_label": "Cancel", "button_variant": null, "requires_feedback": false, "feedback_prompt": null, "pre_actions": [], "post_actions": []}
    ]'
);

-- Migrate existing task.status values to workflow_status
-- Map legacy TEXT status to new workflow_status field
UPDATE tasks SET workflow_status = CASE
    WHEN status = 'todo' THEN 'todo'
    WHEN status = 'inprogress' THEN 'inprogress'
    WHEN status = 'inreview' THEN 'inreview'
    WHEN status = 'done' THEN 'done'
    WHEN status = 'cancelled' THEN 'cancelled'
    ELSE 'todo'
END;
