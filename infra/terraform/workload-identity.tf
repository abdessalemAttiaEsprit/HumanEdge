# Identité dédiée pour que le pod hr-backend s'authentifie auprès de Cloud SQL via le
# Cloud SQL Auth Proxy (side-car, voir infra/k8s/base/backend-deployment.yaml) plutôt que
# par mot de passe MySQL + IP autorisée (google_sql_database_instance.this.settings.
# ip_configuration.authorized_networks dans cloudsql.tf) - contourne le problème de l'IP du
# nœud qui change à chaque redimensionnement quotidien du node pool. Voir
# docs/deployment/07-checklist-securite-budget.md.

resource "google_service_account" "hr_backend_sql" {
  account_id   = "hr-backend-sql"
  display_name = "hr-backend (Cloud SQL Auth Proxy)"
  description  = "Identité utilisée par le side-car cloud-sql-proxy du pod hr-backend - aucun rôle au-delà de cloudsql.client."
}

resource "google_project_iam_member" "hr_backend_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.hr_backend_sql.email}"
}

# Autorise le KubernetesServiceAccount hr-backend-ksa (namespace hr, voir
# infra/k8s/base/backend-serviceaccount.yaml) à agir en tant que ce GSA via Workload
# Identity - remplace la distribution d'une clé JSON de service account (jamais nécessaire
# avec Workload Identity, contrairement à l'ancienne intégration Cloud SQL Auth Proxy).
resource "google_service_account_iam_member" "hr_backend_workload_identity" {
  service_account_id = google_service_account.hr_backend_sql.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[hr/hr-backend-ksa]"
}
