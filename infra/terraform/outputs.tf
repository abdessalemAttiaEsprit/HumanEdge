output "project_id" {
  value = var.project_id
}

output "gke_cluster_name" {
  value = google_container_cluster.this.name
}

output "gke_cluster_zone" {
  value = google_container_cluster.this.location
}

output "mysql_instance_connection_name" {
  description = "Format <project>:<region>:<instance>, utile pour Cloud SQL Auth Proxy - non utilisé ici (accès IP publique directe), gardé pour référence"
  value       = google_sql_database_instance.this.connection_name
}

output "mysql_public_ip" {
  value = google_sql_database_instance.this.public_ip_address
}

output "mysql_database_name" {
  value = google_sql_database.hr.name
}

# Utilisé pour construire DB_URL (voir docs/deployment/03-secrets.md):
# jdbc:mysql://<mysql_public_ip>:3306/<mysql_database_name>?useSSL=true&serverTimezone=UTC
