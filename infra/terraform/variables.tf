variable "project_id" {
  description = "ID du projet GCP (unique globalement, ex: hrapp-471203) - créé manuellement dans la console/CLI avant `terraform init`, voir docs/deployment/02-terraform-gke.md"
  type        = string
}

variable "region" {
  description = "Région GCP pour les ressources régionales (réseau, Cloud SQL)"
  type        = string
  default     = "europe-west1"
}

variable "zone" {
  description = "Zone GCP pour le cluster GKE zonal (control plane gratuit, contrairement à un cluster régional) et le node pool"
  type        = string
  default     = "europe-west1-b"
}

variable "prefix" {
  description = "Préfixe court utilisé pour nommer toutes les ressources (ex: hrapp)"
  type        = string
  default     = "hrapp"
}

variable "kubernetes_version" {
  description = "Version de Kubernetes pour GKE (null = version par défaut du canal 'regular' dans la zone)"
  type        = string
  default     = null
}

variable "gke_node_machine_type" {
  description = "Type de machine du (seul) node pool GKE - e2-standard-2 = 2 vCPU/8 Go, équivalent du Standard_B2ms Azure. Nécessaire pour héberger Ollama (modèle LLM) en plus de backend/frontend/Argo CD/monitoring sur ce nœud unique. Voir docs/deployment/00-overview.md pour le calcul de budget."
  type        = string
  default     = "e2-standard-2"
}

variable "mysql_tier" {
  description = "Tier Cloud SQL pour MySQL - db-f1-micro (0.6 Go RAM, partagé) suffit pour un labo/démo à faible trafic. Voir docs/deployment/00-overview.md pour le calcul de budget."
  type        = string
  default     = "db-f1-micro"
}

variable "mysql_admin_username" {
  description = "Login administrateur Cloud SQL (utilisateur applicatif, 'root' est réservé par Cloud SQL)"
  type        = string
  default     = "hradmin"
}

variable "mysql_admin_password" {
  description = "Mot de passe administrateur Cloud SQL - à fournir via TF_VAR_mysql_admin_password ou un terraform.tfvars local non commité, jamais en clair dans le repo"
  type        = string
  sensitive   = true
}

variable "labels" {
  description = "Labels appliqués à toutes les ressources qui le supportent"
  type        = map(string)
  default = {
    project     = "hr"
    environment = "student-trial"
  }
}
