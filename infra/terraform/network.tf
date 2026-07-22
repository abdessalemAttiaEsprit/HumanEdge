# Réseau minimal : un seul VPC/subnet pour le node pool GKE. Le serveur Cloud SQL reste en
# accès public (pas de Private Service Connect/VPC peering) pour garder le setup simple -
# voir cloudsql.tf pour le compromis sécurité associé (documenté aussi dans la checklist).

resource "google_compute_network" "this" {
  name                    = "${var.prefix}-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.compute]
}

resource "google_compute_subnetwork" "gke" {
  name          = "${var.prefix}-gke-subnet"
  network       = google_compute_network.this.id
  region        = var.region
  ip_cidr_range = "10.10.1.0/24"

  # Plages secondaires requises par GKE en mode VPC-native (routage direct des IP de pods/
  # services, standard depuis GKE 1.21+, plus besoin de "kubenet").
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.20.0.0/16"
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.30.0.0/20"
  }
}
