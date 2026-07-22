terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
  }

  # Rempli au moment du `terraform init -backend-config=backend.hcl` (voir
  # docs/deployment/02-terraform-gke.md pour la commande de bootstrap du bucket GCS).
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
