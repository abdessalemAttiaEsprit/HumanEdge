# Cluster GKE "budget étudiant" : cluster zonal Standard (control plane gratuit, couvert par
# le crédit "Always Free" de $74.40/mois par compte de facturation - voir
# docs/deployment/00-overview.md), un seul node pool e2-standard-2 (2 vCPU/8 Go) à taille
# fixe, partagé par backend/frontend/Argo CD/monitoring/Ollama. Pas d'autoscaler pour garder
# un coût prévisible.
#
# Le pool par défaut créé automatiquement par `google_container_cluster` (nom fixe "default-
# pool", peu configurable) est supprimé au profit d'un `google_container_node_pool` explicite
# - c'est le pattern recommandé par le provider Terraform pour garder le contrôle total sur
# la taille/le type de machine du pool réellement utilisé.

resource "google_container_cluster" "this" {
  name     = "${var.prefix}-gke"
  location = var.zone # cluster zonal (pas régional) : 1 seule réplique de control plane, gratuite

  network    = google_compute_network.this.id
  subnetwork = google_compute_subnetwork.gke.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  min_master_version = var.kubernetes_version

  remove_default_node_pool = true
  initial_node_count       = 1

  deletion_protection = false

  resource_labels = var.labels

  depends_on = [google_project_service.container]
}

resource "google_container_node_pool" "system" {
  name     = "system"
  cluster  = google_container_cluster.this.name
  location = var.zone
  # node_count : taille fixe, pas de bloc autoscaling { } - voir docs/deployment/
  # 02-terraform-gke.md pour comment ramener ce nombre à 0 entre deux sessions de travail
  # (équivalent GKE de `az aks stop`, qui n'a pas d'égal direct côté GCP).
  node_count = 1

  node_config {
    machine_type = var.gke_node_machine_type
    disk_size_gb = 30
    disk_type    = "pd-standard"
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]
    labels       = var.labels
  }
}
