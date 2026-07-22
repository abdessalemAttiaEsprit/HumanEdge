# Ressources GCP à chiffrer — crédit d'essai 300$

Ce fichier ne contient **volontairement aucun prix** : c'est la liste des ressources (avec
leurs specs exactes) à chiffrer toi-même via le
[calculateur GCP](https://cloud.google.com/products/calculator) ou `gcloud`. La colonne
**Lien tarifs** pointe vers la page officielle de chaque service pour aller chercher le
tarif exact dans ta région.

Estimation précédente (voir [00-overview.md](00-overview.md#budget)) : ~38-40$ pour 2
semaines en config de base. Avec 300$ de crédit, il reste une marge large (~260$) - la
section 2 liste des améliorations possibles pour se rapprocher d'une "vraie" infra plutôt
qu'un labo au strict minimum, à toi de choisir lesquelles rentrent dans le budget une fois
chiffrées.

## 1. Config de base (déjà dans Terraform/K8s, `infra/terraform/`)

| Catégorie | Ressource GCP | Rôle | Spec actuelle | Contrôlé par | Lien tarifs |
|---|---|---|---|---|---|
| Calcul | Compute Engine (node pool GKE) | Héberge tous les pods (backend, frontend, Ollama, Argo CD, monitoring) | 1× `e2-standard-2` (2 vCPU/8 Go), taille fixe | `gke.tf` → `google_container_node_pool.system` | [cloud.google.com/compute/vm-instance-pricing](https://cloud.google.com/compute/vm-instance-pricing) |
| Calcul | GKE control plane | Orchestration Kubernetes | Standard, zonal (1 zone) | `gke.tf` → `google_container_cluster.this` | [cloud.google.com/kubernetes-engine/pricing](https://cloud.google.com/kubernetes-engine/pricing) |
| Base de données | Cloud SQL MySQL | Base applicative `Hr` | `db-f1-micro` (0,6 Go RAM, partagé), 10 Go `PD_SSD`, zonal | `cloudsql.tf` → `google_sql_database_instance.this` | [cloud.google.com/sql/pricing](https://cloud.google.com/sql/pricing) |
| Réseau | Network Load Balancer | Entrée publique (ingress-nginx) | 1 forwarding rule, IP éphémère | créé automatiquement par le `Service type=LoadBalancer` d'ingress-nginx (voir [04-kubernetes-gitops.md](04-kubernetes-gitops.md)) | [cloud.google.com/vpc/network-pricing](https://cloud.google.com/vpc/network-pricing) |
| Réseau | VPC + subnet | Réseau du cluster | 1 VPC, 1 subnet régional `/24` + 2 plages secondaires | `network.tf` | gratuit (le VPC lui-même ne coûte rien, seul le trafic/les IP en coûtent) |
| Stockage | Persistent Disks (PVC) | Uploads backend, modèles Ollama, données Prometheus/Grafana | ~24 Gi cumulés, `pd-standard` | `infra/k8s/base/*-pvc.yaml` | [cloud.google.com/compute/disks-image-pricing](https://cloud.google.com/compute/disks-image-pricing) |
| Stockage | Cloud Storage (bucket) | State Terraform | 1 bucket, versioning activé, quelques Ko | créé manuellement en [02-terraform-gke.md §2.2](02-terraform-gke.md) | [cloud.google.com/storage/pricing](https://cloud.google.com/storage/pricing) |
| Registre | Docker Hub | Images backend/frontend | Dépôts publics | hors GCP | gratuit (tier public) |

## 2. Améliorations possibles (marge budgétaire disponible)

Chaque ligne est indépendante des autres - à choisir selon ce que tu veux démontrer (perf,
résilience, "vraie" infra publique) une fois les coûts chiffrés.

**Décision actuelle (plafond 200$ sur 4 semaines) :** avec le passage à 4 semaines, le plafond par
semaine se resserre (200$/4 sem. = 50$/sem., contre 210$/3 sem. = 70$/sem.) - le cluster régional
rejoint donc Cloud SQL haute dispo dans les lignes reportées. Retenu : node pool Ollama séparé,
autoscaling, IP publique, Cloud Domains, Cloud DNS, pd-balanced, Cloud Armor, GKE Backup - ≈173$
sur 4 semaines, soit ≈27$ de marge sous le plafond (≈127$ de marge sur les 300$ de crédit). Le
node pool Ollama séparé est priorisé sur le cluster régional : gain direct sur la capacité IA
(modèle Ollama plus gros) contre une haute dispo du control plane, moins critique pour une démo.
Chiffrage détaillé dans l'artifact, section 4.

| Amélioration | Remplace | Bénéfice | Impact GCP | Où le changer | Statut |
|---|---|---|---|---|---|
| Node pool séparé pour Ollama (ex: `e2-standard-4`, 4 vCPU/16 Go) + pool système plus petit (ex: `e2-medium`) | Le nœud unique `e2-standard-2` partagé | Isolation des ressources, modèle Ollama plus gros possible (`llama3.1:latest` 8B au lieu de `llama3.2:3b`), inférence plus rapide | 2 factures Compute Engine au lieu d'1 - à comparer au coût du nœud unique | Ajouter un `google_container_node_pool` dans `gke.tf`, répartir via `nodeSelector`/`taints` dans les Deployments | **Retenu** |
| Autoscaling sur le node pool (au lieu de taille fixe) | `node_count = 1` fixe | Scale à 0 la nuit / scale up en cas de charge démo, sans intervention manuelle | Variable, potentiellement moins cher qu'un nœud fixe si usage intermittent | `gke.tf` → remplacer `node_count` par un bloc `autoscaling { min_node_count / max_node_count }` | **Retenu** |
| Cluster **régional** (3 réplicas control plane) au lieu de zonal | `location = var.zone` (1 zone) | Vraie haute dispo du control plane - survit à une panne de zone GCP | Le free tier GKE ne couvre que zonal/Autopilot - un cluster régional facture le management fee (~0,10$/h) en plus | `gke.tf` → `location = var.region` au lieu de `var.zone` | Reporté (ne rentre plus sous le plafond à 4 semaines aux côtés du node pool séparé) |
| Cloud SQL `db-g1-small` ou `db-custom-2-8192` + option **haute dispo** (régionale) | `db-f1-micro` zonal | DB dédiée (pas de vCPU partagé), failover automatique en cas de panne de zone | Coût compute plus élevé, doublé si HA activée (2e instance standby) | `cloudsql.tf` → `settings.tier` + `availability_type = "REGIONAL"` | Reporté (dépasse le plafond à lui seul) |
| **IP publique statique réservée** (au lieu de l'IP éphémère par défaut) | IP éphémère attribuée automatiquement au Load Balancer | L'IP ne change pas si le Load Balancer est recréé - indispensable pour pointer un vrai nom de domaine de façon stable | Coût marginal, quasi identique à une IP éphémère tant qu'elle est attachée | `gcloud compute addresses create`, puis référencer via `spec.loadBalancerIP` sur le Service ingress-nginx | **Retenu** |
| **Cloud Domains** (achat/enregistrement d'un vrai nom de domaine via GCP) | Aucun domaine (nip.io ou registrar externe) | Répond directement à l'objectif "vraie infra avec IP publique + domaine" ; payé via la facturation GCP donc **peut être couvert par le crédit d'essai** | ~10-20$/an selon le TLD choisi | Console GCP > Cloud Domains, ou `gcloud domains registrations create` | **Retenu** |
| **Cloud DNS** (zone managée) | DNS géré chez le registrar | Gestion centralisée des enregistrements DNS dans GCP, cohérent avec Cloud Domains ci-dessus | Petit coût fixe par zone + par requête | `google_dns_managed_zone` (à ajouter dans un nouveau `dns.tf`) | **Retenu** |
| Disques `pd-balanced` au lieu de `pd-standard` | PVC actuels | Meilleures perf IOPS pour Prometheus/Grafana/Ollama (lecture/écriture plus rapides) | Coût au Go légèrement supérieur | `infra/k8s/base/*-pvc.yaml` → `storageClassName` | **Retenu** |
| Cloud Armor (WAF basique) | Rien (ingress-nginx nu) | Protection contre volumétrie/injections basiques sur l'entrée publique | Coût par policy + par règle évaluée | À brancher sur le backend du Load Balancer généré par ingress-nginx | **Retenu** |
| GKE Backup for GKE (snapshots planifiés des PVC) | Pas de sauvegarde des volumes | Vraie résilience des données (uploads, modèles Ollama) au-delà du backup Cloud SQL déjà inclus | Coût au Go sauvegardé | Activer l'addon `gke_backup_agent_config` sur `google_container_cluster.this` | **Retenu** |

## 3. Notes pour le chiffrage

- Prends une durée de référence cohérente avec la fenêtre de déploiement : 2 semaines =
  336h (14 × 24h), ou moins si tu comptes appliquer la discipline d'arrêt du
  [02-terraform-gke.md §2.6](02-terraform-gke.md#26-discipline-budget--redimensionner-le-node-pool-entre-deux-sessions).
- Les ressources "config de base" tournent déjà 24/7 dans l'estimation initiale ; les
  "améliorations" du tableau 2 s'ajoutent ou remplacent une ligne du tableau 1 - ne double
  compte pas un nœud remplacé par un node pool séparé.
- Le crédit d'essai est en **USD** : les tarifs des pages liées ci-dessus sont eux aussi en
  USD par défaut (choisis ta région, ex. `europe-west1`, dans chaque calculateur pour un
  tarif localisé).
- Avec les lignes retenues (tout sauf Cloud SQL HA et cluster régional) ajoutées à la config de
  base : ≈173$ pour 4 semaines (672h) - sous le plafond de 200$ fixé pour cette itération, avec
  ≈27$ de marge de sécurité (les tarifs ont une incertitude plausible de ±10-15%). Cloud Domains
  ne scale pas avec la durée : il facture l'année complète dès l'enregistrement, quelle que soit
  la fenêtre de déploiement - son poids relatif diminue encore par rapport aux estimations à 2-3
  semaines.
- Cloud SQL HA et le cluster régional restent reportés : ajouter l'un ou l'autre au scénario
  retenu dépasse le plafond de 200$ (≈240$ avec le cluster régional, ≈360$ avec Cloud SQL HA) ;
  les deux ensemble (≈427$) dépasseraient même le crédit d'essai de 300$.
