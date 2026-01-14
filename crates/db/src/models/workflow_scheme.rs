use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::collections::HashSet;
use ts_rs::TS;
use uuid::Uuid;

// ============ Core Type Definitions ============

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WorkflowStatus {
    pub name: String,
    pub display_name: String,
    pub color: String,
    pub position: i32,
    pub is_initial: bool,
    pub is_terminal: bool,
    pub agent_config: Option<WorkflowAgentConfig>,
    pub automated_actions: Vec<WorkflowAutomatedAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WorkflowAgentConfig {
    pub executor_profile_id: Option<ExecutorProfileId>,
    pub instructions: Option<String>,
    pub append_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ExecutorProfileId {
    pub executor: String,
    pub variant: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkflowAutomatedAction {
    Script {
        trigger: ActionTrigger,
        script: String,
        on_failure: Option<TransitionOnFailure>,
    },
    Notification {
        trigger: ActionTrigger,
        sound: String,
    },
    WaitForHuman {
        trigger: ActionTrigger,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ActionTrigger {
    OnEnter,
    OnExit,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TransitionOnFailure {
    pub transition_to: String,
    pub inject_error_logs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WorkflowTransition {
    pub from_status: String,
    pub to_status: String,
    pub button_label: String,
    pub button_variant: Option<String>,
    pub requires_feedback: bool,
    pub feedback_prompt: Option<String>,
    pub pre_actions: Vec<TransitionAction>,
    pub post_actions: Vec<TransitionAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TransitionAction {
    Commit { message_template: String },
    CreatePr { draft: bool },
    InjectFeedback { target: String },
    RunScript { script: String },
    PlaySound { sound: String },
    StorePlan { directory: String },
}

// ============ Database Models ============

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct WorkflowScheme {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub is_default: bool,
    #[sqlx(json)]
    pub statuses: Vec<WorkflowStatus>,
    #[sqlx(json)]
    pub transitions: Vec<WorkflowTransition>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateWorkflowScheme {
    pub name: String,
    pub description: Option<String>,
    pub statuses: Vec<WorkflowStatus>,
    pub transitions: Vec<WorkflowTransition>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateWorkflowScheme {
    pub name: Option<String>,
    pub description: Option<String>,
    pub statuses: Option<Vec<WorkflowStatus>>,
    pub transitions: Option<Vec<WorkflowTransition>>,
}

// ============ Implementation ============

impl WorkflowScheme {
    /// Validate scheme consistency
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();
        let status_names: HashSet<_> = self.statuses.iter().map(|s| &s.name).collect();

        // Check all transitions reference valid statuses
        for t in &self.transitions {
            // Allow "*" as a wildcard for from_status (applies to any status)
            if t.from_status != "*" && !status_names.contains(&t.from_status) {
                errors.push(format!("Transition references unknown status: {}", t.from_status));
            }
            if !status_names.contains(&t.to_status) {
                errors.push(format!("Transition references unknown status: {}", t.to_status));
            }
        }

        // Check at least one initial status
        if !self.statuses.iter().any(|s| s.is_initial) {
            errors.push("Scheme must have at least one initial status".into());
        }

        // Check at least one terminal status
        if !self.statuses.iter().any(|s| s.is_terminal) {
            errors.push("Scheme must have at least one terminal status".into());
        }

        // Check unique status names within scheme
        let mut seen = HashSet::new();
        for status in &self.statuses {
            if !seen.insert(&status.name) {
                errors.push(format!("Duplicate status name: {}", status.name));
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// Get available transitions from a status
    /// Includes both specific transitions and wildcard transitions (from "*")
    pub fn transitions_from(&self, status_name: &str) -> Vec<&WorkflowTransition> {
        self.transitions
            .iter()
            .filter(|t| t.from_status == status_name || t.from_status == "*")
            .collect()
    }

    /// Check if a transition is valid
    /// Supports wildcard transitions that apply to any status
    pub fn is_valid_transition(&self, from: &str, to: &str) -> bool {
        self.transitions
            .iter()
            .any(|t| (t.from_status == from || t.from_status == "*") && t.to_status == to)
    }

    /// Find a status by name
    pub fn find_status(&self, name: &str) -> Option<&WorkflowStatus> {
        self.statuses.iter().find(|s| s.name == name)
    }

    /// Get the default workflow scheme ID (fixed UUID)
    pub fn default_id() -> Uuid {
        Uuid::from_u128(0x00000000_0000_0000_0000_000000000001)
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        #[derive(sqlx::FromRow)]
        struct RawScheme {
            id: Uuid,
            name: String,
            description: Option<String>,
            is_default: bool,
            statuses: String,
            transitions: String,
            created_at: DateTime<Utc>,
            updated_at: DateTime<Utc>,
        }

        let schemes = sqlx::query_as::<_, RawScheme>(
            r#"SELECT
                id,
                name,
                description,
                is_default,
                statuses,
                transitions,
                created_at,
                updated_at
            FROM workflow_schemes
            ORDER BY is_default DESC, name ASC"#
        )
        .fetch_all(pool)
        .await?;

        // Deserialize JSON strings to proper types
        let result = schemes.into_iter().map(|scheme| {
            let statuses = serde_json::from_str(&scheme.statuses).unwrap_or_default();
            let transitions = serde_json::from_str(&scheme.transitions).unwrap_or_default();
            WorkflowScheme {
                id: scheme.id,
                name: scheme.name,
                description: scheme.description,
                is_default: scheme.is_default,
                statuses,
                transitions,
                created_at: scheme.created_at,
                updated_at: scheme.updated_at,
            }
        }).collect();

        Ok(result)
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        #[derive(sqlx::FromRow)]
        struct RawScheme {
            id: Uuid,
            name: String,
            description: Option<String>,
            is_default: bool,
            statuses: String,
            transitions: String,
            created_at: DateTime<Utc>,
            updated_at: DateTime<Utc>,
        }

        let result = sqlx::query_as::<_, RawScheme>(
            r#"SELECT
                id,
                name,
                description,
                is_default,
                statuses,
                transitions,
                created_at,
                updated_at
            FROM workflow_schemes
            WHERE id = $1"#
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(result.map(|r| {
            let statuses = serde_json::from_str(&r.statuses).unwrap_or_default();
            let transitions = serde_json::from_str(&r.transitions).unwrap_or_default();
            WorkflowScheme {
                id: r.id,
                name: r.name,
                description: r.description,
                is_default: r.is_default,
                statuses,
                transitions,
                created_at: r.created_at,
                updated_at: r.updated_at,
            }
        }))
    }

    pub async fn find_default(pool: &SqlitePool) -> Result<Option<Self>, sqlx::Error> {
        #[derive(sqlx::FromRow)]
        struct RawScheme {
            id: Uuid,
            name: String,
            description: Option<String>,
            is_default: bool,
            statuses: String,
            transitions: String,
            created_at: DateTime<Utc>,
            updated_at: DateTime<Utc>,
        }

        let result = sqlx::query_as::<_, RawScheme>(
            r#"SELECT
                id,
                name,
                description,
                is_default,
                statuses,
                transitions,
                created_at,
                updated_at
            FROM workflow_schemes
            WHERE is_default = 1"#
        )
        .fetch_optional(pool)
        .await?;

        Ok(result.map(|r| {
            let statuses = serde_json::from_str(&r.statuses).unwrap_or_default();
            let transitions = serde_json::from_str(&r.transitions).unwrap_or_default();
            WorkflowScheme {
                id: r.id,
                name: r.name,
                description: r.description,
                is_default: r.is_default,
                statuses,
                transitions,
                created_at: r.created_at,
                updated_at: r.updated_at,
            }
        }))
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateWorkflowScheme,
    ) -> Result<Self, sqlx::Error> {
        #[derive(sqlx::FromRow)]
        struct RawScheme {
            id: Uuid,
            name: String,
            description: Option<String>,
            is_default: bool,
            statuses: String,
            transitions: String,
            created_at: DateTime<Utc>,
            updated_at: DateTime<Utc>,
        }

        let id = Uuid::new_v4();
        let statuses_json = serde_json::to_string(&data.statuses)
            .map_err(|_| sqlx::Error::Configuration("JSON serialization failed".into()))?;
        let transitions_json = serde_json::to_string(&data.transitions)
            .map_err(|_| sqlx::Error::Configuration("JSON serialization failed".into()))?;

        sqlx::query_as::<_, RawScheme>(
            r#"INSERT INTO workflow_schemes (id, name, description, statuses, transitions)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING
                id,
                name,
                description,
                is_default,
                statuses,
                transitions,
                created_at,
                updated_at"#
        )
        .bind(id)
        .bind(&data.name)
        .bind(&data.description)
        .bind(&statuses_json)
        .bind(&transitions_json)
        .fetch_one(pool)
        .await
        .map(|r| {
            let statuses = serde_json::from_str(&r.statuses).unwrap_or_default();
            let transitions = serde_json::from_str(&r.transitions).unwrap_or_default();
            WorkflowScheme {
                id: r.id,
                name: r.name,
                description: r.description,
                is_default: r.is_default,
                statuses,
                transitions,
                created_at: r.created_at,
                updated_at: r.updated_at,
            }
        })
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateWorkflowScheme,
    ) -> Result<Self, sqlx::Error> {
        #[derive(sqlx::FromRow)]
        struct RawScheme {
            id: Uuid,
            name: String,
            description: Option<String>,
            is_default: bool,
            statuses: String,
            transitions: String,
            created_at: DateTime<Utc>,
            updated_at: DateTime<Utc>,
        }

        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = data.name.as_ref().unwrap_or(&existing.name);
        let description = data.description.as_ref().or(existing.description.as_ref());
        let statuses = data.statuses.as_ref().unwrap_or(&existing.statuses);
        let transitions = data.transitions.as_ref().unwrap_or(&existing.transitions);

        let statuses_json = serde_json::to_string(statuses)
            .map_err(|_| sqlx::Error::Configuration("JSON serialization failed".into()))?;
        let transitions_json = serde_json::to_string(transitions)
            .map_err(|_| sqlx::Error::Configuration("JSON serialization failed".into()))?;

        sqlx::query_as::<_, RawScheme>(
            r#"UPDATE workflow_schemes
               SET name = $2, description = $3, statuses = $4, transitions = $5, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING
                id,
                name,
                description,
                is_default,
                statuses,
                transitions,
                created_at,
                updated_at"#
        )
        .bind(id)
        .bind(name)
        .bind(description)
        .bind(&statuses_json)
        .bind(&transitions_json)
        .fetch_one(pool)
        .await
        .map(|r| {
            let statuses = serde_json::from_str(&r.statuses).unwrap_or_default();
            let transitions = serde_json::from_str(&r.transitions).unwrap_or_default();
            WorkflowScheme {
                id: r.id,
                name: r.name,
                description: r.description,
                is_default: r.is_default,
                statuses,
                transitions,
                created_at: r.created_at,
                updated_at: r.updated_at,
            }
        })
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        // Prevent deletion of default scheme
        let scheme = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        if scheme.is_default {
            return Err(sqlx::Error::Configuration(
                "Cannot delete the default workflow scheme".into(),
            ));
        }

        let result = sqlx::query!("DELETE FROM workflow_schemes WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Clone a scheme with a new name
    pub async fn clone_scheme(
        pool: &SqlitePool,
        source_id: Uuid,
        new_name: String,
    ) -> Result<Self, sqlx::Error> {
        let source = Self::find_by_id(pool, source_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let data = CreateWorkflowScheme {
            name: new_name,
            description: source.description,
            statuses: source.statuses,
            transitions: source.transitions,
        };

        Self::create(pool, &data).await
    }

    /// Helper to deserialize JSON fields from database record
    #[allow(dead_code)]
    fn deserialize_json_fields(record: Self) -> Result<Self, sqlx::Error> {
        Ok(record) // JSON is already deserialized by #[sqlx(json)]
    }
}
