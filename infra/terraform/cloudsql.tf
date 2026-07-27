# Cloud SQL pour MySQL, tier db-f1-micro (0.6 Go RAM, partagé) - suffisant pour un labo/démo
# à faible trafic, payé sur le crédit d'essai GCP (pas de quota "toujours gratuit" Cloud SQL
# comme il en existait un pour Azure for Students). Remplace un pod MySQL en cluster : géré
# (backups automatiques), et libère la RAM du nœud GKE pour backend/frontend/monitoring.
#
# IP publique conservée (pas d'intégration VPC privée/Private Service Connect - hors
# périmètre) mais plus aucun réseau autorisé : le pod hr-backend s'authentifie désormais via
# le Cloud SQL Auth Proxy + Workload Identity (infra/terraform/workload-identity.tf,
# infra/k8s/base/backend-deployment.yaml) - un tunnel chiffré authentifié par IAM, qui ne
# passe pas par la liste authorized_networks. Voir
# docs/deployment/07-checklist-securite-budget.md.

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
      # Pas de bloc authorized_networks : plus aucune IP ne peut se connecter directement
      # sur le port MySQL brut, seul le Cloud SQL Auth Proxy (authentifié via IAM) le peut.
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
