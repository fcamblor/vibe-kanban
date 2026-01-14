use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TaskStatusTransitionHistory {
    pub id: Uuid,
    pub task_id: Uuid,
    pub from_status: String,
    pub to_status: String,
    pub triggered_by: TransitionTrigger,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum TransitionTrigger {
    Human,
    Auto,
}

impl sqlx::Type<sqlx::Sqlite> for TransitionTrigger {
    fn type_info() -> <sqlx::Sqlite as sqlx::Database>::TypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for TransitionTrigger {
    fn encode_by_ref(
        &self,
        buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>,
    ) -> Result<sqlx::encode::IsNull, Box<dyn std::error::Error + Send + Sync>> {
        let s = match self {
            TransitionTrigger::Human => "Human",
            TransitionTrigger::Auto => "Auto",
        };
        <String as sqlx::Encode<sqlx::Sqlite>>::encode(s.to_string(), buf)
    }
}

impl<'r> sqlx::Decode<'r, sqlx::Sqlite> for TransitionTrigger {
    fn decode(
        value: sqlx::sqlite::SqliteValueRef<'r>,
    ) -> Result<Self, sqlx::error::BoxDynError> {
        let s = <String as sqlx::Decode<sqlx::Sqlite>>::decode(value)?;
        match s.as_str() {
            "Human" => Ok(TransitionTrigger::Human),
            "Auto" => Ok(TransitionTrigger::Auto),
            _ => Err(format!("Invalid TransitionTrigger: {}", s).into()),
        }
    }
}

impl TaskStatusTransitionHistory {
    pub async fn create(
        pool: &SqlitePool,
        task_id: Uuid,
        from_status: String,
        to_status: String,
        triggered_by: TransitionTrigger,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let created_at = Utc::now();

        sqlx::query_as::<_, Self>(
            "INSERT INTO task_status_transition_history (id, task_id, from_status, to_status, triggered_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             RETURNING *"
        )
        .bind(&id)
        .bind(&task_id)
        .bind(&from_status)
        .bind(&to_status)
        .bind(&triggered_by)
        .bind(&created_at)
        .fetch_one(pool)
        .await
    }

    /// Count consecutive auto-transitions to the given status (most recent N)
    pub async fn count_consecutive_auto_to_status(
        pool: &SqlitePool,
        task_id: Uuid,
        to_status: &str,
        limit: i32,
    ) -> Result<i64, sqlx::Error> {
        // Get the N most recent transitions to this status
        let transitions: Vec<(String,)> = sqlx::query_as(
            "SELECT triggered_by FROM task_status_transition_history
             WHERE task_id = ? AND to_status = ?
             ORDER BY created_at DESC
             LIMIT ?"
        )
        .bind(task_id)
        .bind(to_status)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        // Count consecutive "Auto" from the beginning
        let count = transitions
            .iter()
            .take_while(|(trigger,)| trigger == "Auto")
            .count();

        Ok(count as i64)
    }

    /// Clear all transitions for a task (called on human intervention)
    pub async fn clear_for_task(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM task_status_transition_history WHERE task_id = ?")
            .bind(task_id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
