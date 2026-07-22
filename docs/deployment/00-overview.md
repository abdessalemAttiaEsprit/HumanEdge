# Déploiement HR sur GKE — vue d'ensemble

Guide pas-à-pas pour containeriser, déployer et monitorer l'app HR (Spring Boot + MySQL +
React/Vite) sur Google Kubernetes Engine, avec Terraform, GitHub Actions, Argo CD et
Prometheus/Grafana. Tu exécutes toi-même chaque commande - rien n'est automatisé sans que tu
ne le déclenches, et chaque étape explique **ce que fait la commande**, pas seulement ce
qu'il faut taper : l'idée est de comprendre l'infra que tu construis, pas de la copier-
coller à l'aveugle.

> **Pourquoi GCP et pas Azure ?** Le crédit Azure for Students utilisé pour un premier
> déploiement AKS est épuisé. Ce guide cible désormais **GCP/GKE**, financé par les 300$ de
> crédit d'essai (compte GCP jamais utilisé avant), pour un déploiement **temporaire de 4
> semaines maximum, plafonné à 200$ de dépense** (marge de sécurité volontaire sous le crédit
> de 300$) - voir la section [Budget](#budget) plus bas pour le calcul détaillé.
> L'ancienne archi Azure (AKS) reste possible en théorie mais n'est plus documentée ici.

## Architecture cible

```
Internet
   │
   ▼
Ingress (ingress-nginx + cert-manager, 1 Load Balancer public GCP)
   ├── hr.example.com        → Service hr-frontend (nginx, SPA React)
   └── api.hr.example.com    → Service hr-backend  (Spring Boot, port 8081)
                                     │
                                     ▼
                        Cloud SQL pour MySQL (managé, hors cluster, tier db-f1-micro)

Namespace "hr"      : hr-backend, hr-frontend, hr-ollama, PVC uploads + PVC modèles Ollama
Namespace "argocd"  : Argo CD (GitOps)
Namespace "monitoring" : kube-prometheus-stack (Prometheus + Grafana)

Cluster GKE : mode Standard, zonal (control plane gratuit), 2 node pools - système
(e2-medium, 2 vCPU/4 Go) + Ollama dédié (e2-standard-4, 4 vCPU/16 Go)
```

**Pourquoi GKE Standard (pas Autopilot) ?** Autopilot facture au pod (CPU/mémoire réellement
demandés) sans jamais exposer directement de "nœud" à gérer - plus simple, mais moins
prévisible pour un budget fixe et moins pédagogique pour comprendre ce qui tourne où.
Standard donne un contrôle direct sur la VM (type de machine, disque) et se rapproche le
plus de l'expérience AKS déjà documentée.

**Pourquoi un cluster zonal (pas régional) ?** Un cluster régional réplique le control plane
sur 3 zones - plus résilient, mais facturé même s'il dépasse le crédit "toujours gratuit". Un
cluster **zonal** a son control plane entièrement couvert par le crédit GKE "Always Free"
(voir [Budget](#budget)). Pour ce projet, la résilience régionale n'apporte rien tant que les
node pools restent dans une seule zone : si la zone tombe, l'appli est indisponible de toute
façon, qu'il y ait un ou plusieurs node pools. Le cluster régional reste une amélioration
possible mais reportée pour l'instant, faute de budget (voir
[ressources-budget-gcp.md](ressources-budget-gcp.md)).

**Ollama tourne dans le cluster** (`hr-ollama`, image `ollama/ollama`) sur son propre node pool
dédié (`e2-standard-4`, ci-dessus) plutôt que sur le nœud partagé - modèle `llama3.2:3b` par
défaut, avec de la marge pour passer à `llama3.1:latest` (8B) maintenant qu'Ollama dispose de ses
16 Go de RAM dédiés (voir [07-checklist-securite-budget.md](07-checklist-securite-budget.md)).
`ollama.base-url` / `ollama.model` sont pilotés par `OLLAMA_BASE_URL`/`OLLAMA_MODEL` (ConfigMap),
le `RestTemplate` du backend a des timeouts pour ne pas bloquer si Ollama répond lentement.

## Budget

Crédit d'essai GCP, **300$ neufs**. Contrairement à Azure for Students, Cloud SQL n'a pas de
quota "toujours gratuit" dédié : tout est payé sur le crédit d'essai, mais le seul cluster GKE
zonal du projet a son control plane couvert par le crédit "Always Free" de Google (74,40$/mois,
renouvelé chaque mois, indépendant du crédit d'essai).

Chiffrage de référence de la config de base (nœud unique, sans les améliorations retenues
ci-dessous), sur la fenêtre initiale de 2 semaines - réutilisé comme unité de calcul dans
[ressources-budget-gcp.md](ressources-budget-gcp.md) :

| Ressource | Détail | Coût si 24h/24 pendant 14 jours |
|---|---|---|
| GKE control plane | cluster zonal, 1 seul cluster du projet | 0 $ (couvert par le free tier GKE) |
| Nœud GKE | 1× `e2-standard-2` (2 vCPU/8 Go) - ~0,070 $/h | ~24 $ |
| Cloud SQL | `db-f1-micro`, 10 Go SSD | ~11 $ |
| Load Balancer (ingress-nginx) | 1 forwarding rule Network LB - ~0,025 $/h + IP publique en cours d'usage (gratuite tant qu'elle est attachée) | ~8 $ |
| Disques PVC (uploads + modèles Ollama + Prometheus + Grafana) | ~24 Gi au total, `pd-standard` | ~1 $ |
| Bucket GCS (state Terraform) | quelques Ko | < 1 $ |
| Docker Hub | dépôts publics | 0 $ |
| **Total estimé** | | **~38-40 $ pour 2 semaines** |

> Chiffres indicatifs (tarifs publics GCP au 2026-07, région `europe-west1`) - pas relevés
> via une API de pricing comme pour Azure précédemment. Vérifie les tarifs à jour sur le
> [calculateur GCP](https://cloud.google.com/products/calculator) avant de t'engager si tu
> veux une précision au centime près.

### Le plan retenu : 4 semaines, plafonné à 200$

Le déploiement réel vise **4 semaines** (672h), avec plusieurs améliorations retenues en plus de
la config de base ci-dessus : node pool Ollama dédié (voir Architecture cible), IP publique
statique, Cloud Domains, Cloud DNS, disques `pd-balanced`, Cloud Armor, GKE Backup for GKE.
Cloud SQL haute dispo et le cluster **régional** restent reportés : ajoutés au reste, ils
dépasseraient le plafond de 200$ (et, combinés, le crédit de 300$ lui-même). Chiffrage détaillé,
statut Retenu/Reporté ligne par ligne et jauges de marge :
[ressources-budget-gcp.md](ressources-budget-gcp.md).

| | 4 semaines (672h) |
|---|---|
| Total du plan retenu (config de base + améliorations retenues) | **~173 $** |
| Plafond de dépense auto-imposé | 200 $ |
| Marge sous le plafond | ~27 $ |
| Marge sur le crédit d'essai (300 $) | ~127 $ |

Le nœud GKE reste l'un des postes les plus élevés et facture à la seconde : si tu veux réduire
encore la facture, ramène les node pools à 0 nœud entre deux sessions de travail (`gcloud
container clusters resize`, voir [02-terraform-gke.md](02-terraform-gke.md)) - GKE n'a pas
d'équivalent direct de `az aks stop` (qui met en pause tout le cluster) : côté GCP, on
redimensionne le node pool à 0
plutôt que d'arrêter le cluster lui-même.

## `dev` vs `prod` (overlays Kustomize)

Le budget/la deadline ne permettent qu'**un seul cluster GKE** à la fois. `infra/k8s/overlays/prod`
est celui réellement déployé sur GKE et suivi par Argo CD. `infra/k8s/overlays/dev` est prévu
pour un cluster local (kind/minikube/Docker Desktop Kubernetes, gratuit) si tu veux tester
des changements de manifestes avant de les pousser sur `prod` - il n'est pas destiné à
tourner en même temps que `prod` sur les node pools payants.

## Prérequis à installer localement

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`)
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.6
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Helm](https://helm.sh/docs/intro/install/) >= 3
- [kustomize](https://kubectl.docs.kubernetes.io/installation/kustomize/) (ou la version
  intégrée à `kubectl apply -k`, suffisante pour un simple `apply` mais pas pour `kustomize
  edit set image` utilisé par la CI)
- [kubeseal](https://github.com/bitnami-labs/sealed-secrets#kubeseal) (CLI Sealed Secrets)
- Docker Desktop (ou équivalent) pour builder les images localement
- Un compte [Docker Hub](https://hub.docker.com/) (gratuit)
- Un compte GCP avec le crédit d'essai 300$ activé (carte bancaire requise à l'inscription,
  mais aucun prélèvement automatique une fois le crédit épuisé sauf passage manuel à un
  compte de facturation payant)

## Ordre des phases

1. [01-containerization.md](01-containerization.md) — builder/tester les images en local
2. [02-terraform-gke.md](02-terraform-gke.md) — provisionner GCP (projet, GKE, Cloud SQL)
3. [03-secrets.md](03-secrets.md) — Sealed Secrets, créer les vrais secrets applicatifs
4. [04-kubernetes-gitops.md](04-kubernetes-gitops.md) — installer Argo CD, premier déploiement
5. [05-cicd-github-actions.md](05-cicd-github-actions.md) — brancher la CI (Docker Hub, GitOps)
6. [06-monitoring.md](06-monitoring.md) — Prometheus + Grafana
7. [07-checklist-securite-budget.md](07-checklist-securite-budget.md) — à lire avant de considérer que c'est "en prod"
