# Cloud SQL pour MySQL, tier db-f1-micro (0.6 Go RAM, partagé) - suffisant pour un labo/démo
# à faible trafic, payé sur le crédit d'essai GCP (pas de quota "toujours gratuit" Cloud SQL
# comme il en existait un pour Azure for Students). Remplace un pod MySQL en cluster : géré
# (backups automatiques), et libère la RAM du nœud GKE pour backend/frontend/monitoring.
#
# Accès public + réseau autorisé "0.0.0.0/0" plutôt qu'une intégration VPC privée (Private
# Service Connect) : plus simple à opérer soi-même le temps d'un déploiement de 2 semaines.
# Compromis sécurité documenté dans docs/deployment/07-checklist-securite-budget.md
# (alternative : restreindre à l'IP de sortie du cluster une fois connue).

resource "google_sql_database_instance" "this" {
  name             = "${var.prefix}-mysql"
  database_version = "MYSQL_8_0"
  region           = var.region

  settings {
    tier              = var.mysql_tier
    availability_type = "ZONAL" # pas de haute dispo régionale, inutile pour un labo/démo
    disk_size         = 10      # Go, taille minimale pratique pour db-f1-micro
    disk_type         = "PD_SSD"
    disk_autoresize   = false

    backup_configuration {
      enabled = true
    }

    ip_configuration {
      ipv4_enabled = true
      authorized_networks {
        name  = "allow-all-temporary"
        value = "0.0.0.0/0"
      }
    }
  }

  # Autorise `terraform destroy` sans étape manuelle - acceptable pour un déploiement
  # temporaire de 2 semaines, à retirer si l'instance devient durable.
  deletion_protection = false

  depends_on = [google_project_service.sqladmin]
}

resource "google_sql_database" "hr" {
  name      = "Hr"
  instance  = google_sql_database_instance.this.name
  charset   = "utf8mb4"
  collation = "utf8mb4_unicode_ci"
}

resource "google_sql_user" "hradmin" {
  name     = var.mysql_admin_username
  instance = google_sql_database_instance.this.name
  password = var.mysql_admin_password
}
