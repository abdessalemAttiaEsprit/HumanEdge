# Récapitulatif — déploiement GKE de l'app HR

Vue d'ensemble de tout ce qui a été fait pendant la phase de déploiement GCP/GKE, au-delà du
guide pas-à-pas ([docs/deployment/00-overview.md](deployment/00-overview.md) et suivants).
Ce document sert de point d'entrée : chaque section renvoie vers le chapitre détaillé
correspondant plutôt que de dupliquer le contenu.

## 1. Infra de base (Terraform + GitOps)

- Pivot Azure → GCP après épuisement du crédit Azure for Students : cluster GKE **zonal**
  (`hrapp-gke`, `europe-west1-b`), 1 seul node pool `system` (`e2-standard-2`), Cloud SQL
  `db-f1-micro`, projet `hrapp-471203`. Détails et arbitrages budget :
  [00-overview.md](deployment/00-overview.md), [ressources-budget-gcp.md](deployment/ressources-budget-gcp.md).
- Chaîne GitOps complète installée et fonctionnelle : ingress-nginx, cert-manager
  (Let's Encrypt), Sealed Secrets, Argo CD (App-of-Apps `hr-root` → `hr-app`).
  Voir [03-secrets.md](deployment/03-secrets.md), [04-kubernetes-gitops.md](deployment/04-kubernetes-gitops.md).
- 2 bugs réels corrigés dans les manifestes pendant la mise en route : un patch Kustomize
  sans `namespace: hr` (bloquait le sync Argo CD) et un hook `postStart` d'Ollama qui
  utilisait `curl`, absent de l'image `ollama/ollama:latest` actuelle.

## 2. CI/CD (GitHub Actions)

Les deux workflows (`backend-ci-cd.yml`/`frontend-ci-cd.yml`) tournent réellement de bout en
bout : test → build/push Docker Hub → bump du tag dans Kustomize → sync Argo CD. Détails :
[05-cicd-github-actions.md](deployment/05-cicd-github-actions.md).

- **Bug corrigé** : `backend/mvnw` avait perdu son bit exécutable en étant commité depuis
  Windows (`Permission denied`, exit 126, en CI) → `git update-index --chmod=+x backend/mvnw`.
- **Bug de documentation encore ouvert jusqu'à cette mise à jour** : la section "premier
  push manuel" de [01-containerization.md](deployment/01-containerization.md) retaguait
  l'image de test locale (`VITE_API_BASE_URL=http://localhost:8081`) directement comme
  `:latest` en prod, sans jamais la reconstruire avec la vraie URL — corrigé dans cette
  session (voir section 8 ci-dessous), le CI/CD lui-même n'a jamais eu ce problème (il
  reconstruit toujours avec la bonne URL via une Variable GitHub).

## 3. Monitoring (Prometheus + Grafana)

`kube-prometheus-stack` installé (values allégées pour tenir sur le nœud unique). Détails :
[06-monitoring.md](deployment/06-monitoring.md).

- **Capacité CPU chroniquement tendue** depuis l'ajout du monitoring : le nœud unique tourne
  à ~86% de CPU réservée même sans le pod backend, ce qui fait échouer en `Insufficient cpu`
  chaque rolling update du backend tant que l'ancien ReplicaSet n'est pas explicitement
  scale à 0. Solution de contournement documentée, correction durable = node pool Ollama
  dédié (amélioration "Retenu" jamais implémentée, voir [ressources-budget-gcp.md](deployment/ressources-budget-gcp.md)).
- Le dashboard Grafana communautaire ID 315 ("Kubernetes cluster monitoring") est
  **incompatible** avec les nœuds GKE modernes (cgroup v2) — tous les panneaux affichent
  "N/A". Utiliser les dashboards intégrés au chart à la place.

## 4. Domaine réel

`human-edge.dev` enregistré et configuré (IP statique, Cloud DNS, certificats Let's Encrypt).
Chapitre dédié : [08-domaine-reel.md](deployment/08-domaine-reel.md).

## 5. Fonctionnalité "mot de passe oublié"

Premier vrai changement de code applicatif (pas juste de l'infra) : lien de réinitialisation
par email, token à usage unique (45 min), même logique anti-oracle que l'OTP de login déjà
en place. Backend (`PasswordResetToken`/`PasswordResetService`/endpoints `/api/auth/forgot-
password` et `/reset-password`) + frontend (`ForgotPasswordPage`/`ResetPasswordPage`) +
`FRONTEND_BASE_URL` ajouté aux ConfigMaps (même pattern que `CORS_ALLOWED_ORIGINS`).

## 6. Chapitre 7 — Sécurité & budget

Checklist complète : [07-checklist-securite-budget.md](deployment/07-checklist-securite-budget.md).

- ✅ Alerte de budget GCP créée via la Console (l'API CLI refuse sur les comptes de
  facturation d'essai gratuit — limitation connue, pas un bug de la commande).
- ✅ Cloud SQL restreint : remplacement de l'accès public (`0.0.0.0/0`) par un
  **Cloud SQL Auth Proxy en side-car + Workload Identity** (le pod `hr-backend` s'authentifie
  par IAM plutôt que par IP autorisée, qui ne survivait pas au redimensionnement quotidien du
  node pool). Nouveau `infra/terraform/workload-identity.tf`, conteneur `cloud-sql-proxy`
  dans `backend-deployment.yaml`.
- ⚠️ **Mot de passe admin par défaut (`admin@esprit.tn`/`admin`) toujours actif** — reste à
  changer via la page Profil, jamais confirmé fait.

## 7. Bug résolu : score IA (Ollama) qui semblait ne pas fonctionner

L'évaluation IA calculait bien le score (vérifié directement via l'API : `aiScore`,
`aiFeedback` correctement enregistrés), mais l'ingress coupait la réponse après 60s
(timeout par défaut `ingress-nginx`) alors que le flux (2 appels séquentiels à Ollama,
validation du CV puis notation) peut prendre jusqu'à ~180s sur le nœud CPU-only. Le
navigateur recevait une 504 avant que le backend ait fini, donnant l'impression que "ça ne
marche pas" alors que le score était bien enregistré, invisible sans rafraîchir.

**Corrigé** : `nginx.ingress.kubernetes.io/proxy-read-timeout`/`proxy-send-timeout` portés à
`240` sur `infra/k8s/base/ingress.yaml`. Vérifié en conditions réelles (200 OK en ~98s).
Documenté dans [07-checklist-securite-budget.md](deployment/07-checklist-securite-budget.md).

## 8. Documentation corrigée dans cette mise à jour

- [01-containerization.md](deployment/01-containerization.md) : la section "premier push
  manuel" reconstruit désormais l'image frontend avec la bonne URL de production avant de
  la pousser, au lieu de retaguer l'image de test locale (le bug qui avait touché le vrai
  déploiement, voir section 2).
- [02-terraform-gke.md](deployment/02-terraform-gke.md) : ajout d'une note sur la commande
  fiable pour vérifier qu'un `resize` a bien pris effet (`currentNodeCount`).
- [06-monitoring.md](deployment/06-monitoring.md) : ajout de la section capacité CPU /
  dashboard 315 (section 3 ci-dessus).
- Nouveaux chapitres [09-commandes-operationnelles.md](deployment/09-commandes-operationnelles.md)
  et [10-qualite-securite-code.md](deployment/10-qualite-securite-code.md).

## 9. Routine quotidienne (budget)

Établie et exécutée automatiquement sur les signaux "fin de journée"/"nouveau jour"/
"bonjour" : redimensionner le node pool à 0 et mettre Cloud SQL en pause
(`activation-policy=NEVER`) en fin de session, inverser au début. Commandes et vérifications
détaillées : [09-commandes-operationnelles.md](deployment/09-commandes-operationnelles.md).

## Points ouverts (à ne pas considérer comme réglés)

- **Mot de passe admin par défaut** (`admin@esprit.tn`/`admin`) — toujours actif, à changer
  par l'utilisateur via la page Profil.
- **Incohérence email du compte candidat unique de la base** : l'email de connexion
  (`User.email` = `lightsquare@gmail.com`) diffère de l'email affiché dans le profil
  candidat (`Candidate.email` = `lightsquare8888@gmail.com`, utilisé pour les notifications).
  Se connecter ou faire "mot de passe oublié" avec le mauvais des deux échoue silencieusement
  (comportement anti-oracle voulu, mais source de confusion) — **en attente de confirmation
  de l'utilisateur sur quel email il utilise réellement** avant de corriger les données.
- NetworkPolicies (optionnel, non livré), rotation des secrets (non demandée),
  `terraform destroy` en fin d'expérimentation (pas encore dû).
- Node pool Ollama dédié, autoscaling, `pd-balanced`, Cloud Armor, GKE Backup — améliorations
  "Retenu" documentées mais jamais implémentées (voir [ressources-budget-gcp.md](deployment/ressources-budget-gcp.md)).
- Intégration SonarQube/Snyk/Trivy — plan documenté dans
  [10-qualite-securite-code.md](deployment/10-qualite-securite-code.md), **pas encore implémentée**
  (prochain chantier).
