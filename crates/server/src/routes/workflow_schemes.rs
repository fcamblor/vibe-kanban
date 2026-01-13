use axum::{
    Extension, Json, Router,
    extract::State,
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use chrono::Utc;
use db::models::workflow_scheme::{
    CreateWorkflowScheme, UpdateWorkflowScheme, WorkflowScheme,
};
use deployment::Deployment;
use uuid::Uuid;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, middleware::load_workflow_scheme_middleware};

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let inner = Router::new()
        .route("/", get(list_schemes).post(create_scheme))
        .route(
            "/{scheme_id}",
            get(get_scheme)
                .put(update_scheme)
                .delete(delete_scheme)
                .layer(from_fn_with_state(
                    deployment.clone(),
                    load_workflow_scheme_middleware,
                )),
        )
        .route("/{scheme_id}/clone", post(clone_scheme))
        .route(
            "/{scheme_id}/validate",
            post(validate_scheme).layer(from_fn_with_state(
                deployment.clone(),
                load_workflow_scheme_middleware,
            )),
        );

    Router::new().nest("/workflow-schemes", inner)
}

pub async fn list_schemes(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<WorkflowScheme>>>, ApiError> {
    let schemes = WorkflowScheme::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(schemes)))
}

pub async fn get_scheme(
    Extension(scheme): Extension<WorkflowScheme>,
) -> Result<ResponseJson<ApiResponse<WorkflowScheme>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(scheme)))
}

pub async fn create_scheme(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateWorkflowScheme>,
) -> Result<ResponseJson<ApiResponse<WorkflowScheme>>, ApiError> {
    // Validate scheme before creating
    let temp_scheme = WorkflowScheme {
        id: Uuid::new_v4(),
        name: payload.name.clone(),
        description: payload.description.clone(),
        is_default: false,
        statuses: payload.statuses.clone(),
        transitions: payload.transitions.clone(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    temp_scheme.validate().map_err(|errors| {
        ApiError::BadRequest(format!("Invalid workflow scheme: {}", errors.join(", ")))
    })?;

    let scheme = WorkflowScheme::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workflow_scheme_created",
            serde_json::json!({
                "scheme_id": scheme.id.to_string(),
                "scheme_name": scheme.name,
                "status_count": scheme.statuses.len(),
                "transition_count": scheme.transitions.len(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(scheme)))
}

pub async fn update_scheme(
    Extension(scheme): Extension<WorkflowScheme>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateWorkflowScheme>,
) -> Result<ResponseJson<ApiResponse<WorkflowScheme>>, ApiError> {
    // Validate new scheme configuration if provided
    if payload.statuses.is_some() || payload.transitions.is_some() {
        let statuses = payload.statuses.as_ref().unwrap_or(&scheme.statuses);
        let transitions = payload.transitions.as_ref().unwrap_or(&scheme.transitions);
        let temp_scheme = WorkflowScheme {
            id: scheme.id,
            name: payload.name.clone().unwrap_or(scheme.name.clone()),
            description: payload.description.clone().or(scheme.description.clone()),
            is_default: scheme.is_default,
            statuses: statuses.clone(),
            transitions: transitions.clone(),
            created_at: scheme.created_at,
            updated_at: Utc::now(),
        };

        temp_scheme.validate().map_err(|errors| {
            ApiError::BadRequest(format!("Invalid workflow scheme: {}", errors.join(", ")))
        })?;
    }

    let updated_scheme = WorkflowScheme::update(&deployment.db().pool, scheme.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workflow_scheme_updated",
            serde_json::json!({
                "scheme_id": scheme.id.to_string(),
                "scheme_name": updated_scheme.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_scheme)))
}

pub async fn delete_scheme(
    Extension(scheme): Extension<WorkflowScheme>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    if scheme.is_default {
        return Err(ApiError::BadRequest(
            "Cannot delete the default workflow scheme".into(),
        ));
    }

    let rows_affected = WorkflowScheme::delete(&deployment.db().pool, scheme.id).await?;

    if rows_affected == 0 {
        return Err(ApiError::BadRequest("Workflow scheme not found".into()));
    }

    deployment
        .track_if_analytics_allowed(
            "workflow_scheme_deleted",
            serde_json::json!({
                "scheme_id": scheme.id.to_string(),
                "scheme_name": scheme.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn clone_scheme(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CloneSchemeRequest>,
) -> Result<ResponseJson<ApiResponse<WorkflowScheme>>, ApiError> {
    let cloned_scheme =
        WorkflowScheme::clone_scheme(&deployment.db().pool, payload.scheme_id, payload.name)
            .await?;

    deployment
        .track_if_analytics_allowed(
            "workflow_scheme_cloned",
            serde_json::json!({
                "original_scheme_id": payload.scheme_id.to_string(),
                "cloned_scheme_id": cloned_scheme.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(cloned_scheme)))
}

pub async fn validate_scheme(
    Extension(scheme): Extension<WorkflowScheme>,
) -> Result<ResponseJson<ApiResponse<ValidationResult>>, ApiError> {
    match scheme.validate() {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(ValidationResult {
            is_valid: true,
            errors: vec![],
        }))),
        Err(errors) => Ok(ResponseJson(ApiResponse::success(ValidationResult {
            is_valid: false,
            errors,
        }))),
    }
}

// ============ Request/Response Types ============

#[derive(serde::Deserialize, ts_rs::TS)]
pub struct CloneSchemeRequest {
    pub scheme_id: Uuid,
    pub name: String,
}

#[derive(serde::Serialize, ts_rs::TS)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
}

