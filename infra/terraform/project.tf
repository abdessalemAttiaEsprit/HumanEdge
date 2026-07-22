# GCP n'a pas d'équivalent direct du "resource group" Azure : les ressources sont
# rattachées directement à un projet (var.project_id), déjà créé manuellement avant
# `terraform init` (voir docs/deployment/02-terraform-gke.md, étape 2.1). Ce fichier se
# contente d'activer les APIs nécessaires - un projet neuf les a toutes désactivées par
# défaut, et Terraform échouerait sur le premier `apply` sans ça.

resource "google_project_service" "compute" {
  project            = var.project_id
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "container" {
  project            = var.project_id
  service            = "container.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "sqladmin" {
  project            = var.project_id
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}
