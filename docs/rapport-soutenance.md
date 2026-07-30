# Rapport de soutenance — HumanEdge (HR & Recruitment Management)

> Document de synthèse couvrant le développement, le DevOps et le déploiement du projet.
> Sert de support de préparation à l'oral ; chaque section renvoie vers la documentation
> détaillée correspondante dans le dépôt pour aller plus loin si le jury pose une question
> pointue.

## Table des matières

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Présentation fonctionnelle de l'application](#2-présentation-fonctionnelle-de-lapplication)
3. [Stack technique](#3-stack-technique)
4. [Volet Développement](#4-volet-développement)
5. [Volet DevOps](#5-volet-devops)
6. [Volet Déploiement (Infrastructure)](#6-volet-déploiement-infrastructure)
7. [Sécurité](#7-sécurité)
8. [Budget et gestion des coûts](#8-budget-et-gestion-des-coûts)
9. [Difficultés rencontrées et résolues](#9-difficultés-rencontrées-et-résolues)
10. [Chronologie du projet](#10-chronologie-du-projet)
11. [Démonstration](#11-démonstration)
12. [Bilan, limites et perspectives](#12-bilan-limites-et-perspectives)
13. [Annexes](#13-annexes)

---

## 1. Contexte et objectifs

**HumanEdge** est une application de gestion RH (entreprises, personnel, contrats, absences,
paie) intégrant un module de recrutement assisté par IA : les CV des candidats sont évalués
face à une offre d'emploi par un LLM exécuté **localement** (Ollama), qui renvoie un score
0-100 et un feedback détaillé — sans envoyer aucune donnée à un service tiers.

Au-delà du développement applicatif, l'objectif du projet a été de livrer une **chaîne de
déploiement complète et réaliste** pour une application étudiante à budget contraint :
conteneurisation, infrastructure as code, CI/CD, GitOps, observabilité et sécurité — le tout
réellement déployé et exploitable en ligne, pas seulement documenté sur le papier.

**Démo en ligne** : https://hr.human-edge.dev

---

## 2. Présentation fonctionnelle de l'application

| Domaine | Fonctionnalités |
|---|---|
| Authentification | Login/register, MFA par email (code à 6 chiffres) pour les comptes entreprise, réinitialisation de mot de passe par lien email pour tous les comptes |
| Multi-tenant entreprise | Inscription avec abonnement (plans simulés), gestion du personnel, contrats, absences, paie |
| Recrutement | Offres d'emploi, candidatures, **évaluation de CV par IA**, planification d'entretiens |
| Rôles | `ADMIN` (vue plateforme), `COMPANY` (gestion de son entreprise), `GUEST` (candidat) |

L'application compte **12 contrôleurs REST** côté backend (Auth, Account, Company,
Personnel, Contract, Absence, JobPosting, Application, Candidate, Interview, Subscription,
Payment) et **21 pages** côté frontend, pour environ 94 fichiers Java et 59 fichiers
TypeScript/TSX.

---

## 3. Stack technique

| Composant | Technologies |
|---|---|
| Backend | Java 17, Spring Boot 3.5.6, Spring Security (JWT), Spring Data JPA, MySQL, Spring Mail, Actuator + Micrometer/Prometheus |
| Frontend | React 18, TypeScript 5, Vite 4, React Router v6, TanStack Query v5, Axios |
| IA | Ollama (`llama3.2:3b`), appelé en interne par le backend via `RestTemplate` |
| PDF | OpenPDF, PDFBox (génération de documents) |
| Tests | Spring Boot Test, Spring Security Test, H2, JaCoCo (couverture) |
| Infra | Terraform (GCP/GKE), Kubernetes, Kustomize, Argo CD (GitOps), Docker |
| CI/CD | GitHub Actions → Docker Hub → bump GitOps automatique |
| Sécurité code | Trivy (actif), SonarCloud + Snyk (câblés, en attente d'activation) |
| Observabilité | Prometheus, Grafana (kube-prometheus-stack) |

**Contrainte notable** : le poste de développement tourne sous Node.js 16 (EOL), ce qui a
imposé un épinglage volontaire des versions frontend (Vite 4, react-router v6,
`@vitejs/plugin-react` ~4.2.1) — les versions plus récentes exigent Node 18+/20+.

---

## 4. Volet Développement

### 4.1 Backend (Spring Boot)

Architecture REST classique (Controller / Service / Repository JPA), sécurisée par JWT.
Points remarquables :

- **MFA par email** pour les comptes `COMPANY` (`OtpService`, code à usage unique) — les
  comptes `ADMIN` en sont volontairement exemptés (un seul opérateur de confiance par
  déploiement).
- **Réinitialisation de mot de passe** (ajoutée en cours de projet) : `PasswordResetToken` +
  `PasswordResetService`, même logique anti-abus que l'OTP (token à usage unique, 45 min,
  invalidé au re-request), mais via un lien email plutôt qu'un code à 6 chiffres. Endpoints
  publics `/api/auth/forgot-password` et `/reset-password`. La réponse ne révèle jamais si
  l'email existe en base (protection contre l'énumération de comptes).
- **Intégration Ollama** (`RecruitingIAService`) : deux appels séquentiels au LLM (validation
  du CV, puis notation) pour produire `aiScore` + `aiFeedback` sur chaque candidature.
  Configuration entièrement pilotée par variables d'environnement
  (`OLLAMA_BASE_URL`/`OLLAMA_MODEL`), pour rester déployable sans rebuild d'image.
- **Paiement simulé** (`PaymentSimulatorService`) pour les abonnements entreprise — pas de
  vraie passerelle bancaire.

### 4.2 Frontend (React/Vite/TS)

SPA avec routage par rôle (`ADMIN`/`COMPANY`/`GUEST`), état serveur géré par TanStack Query,
appels HTTP via Axios avec URL de base configurable (`VITE_API_BASE_URL`). Pages ajoutées
en cours de projet : `ForgotPasswordPage`, `ResetPasswordPage`.

---

## 5. Volet DevOps

### 5.1 Conteneurisation

Backend et frontend sont chacun packagés en image Docker (voir
[docs/deployment/01-containerization.md](deployment/01-containerization.md)), testables en
local via `docker compose up --build`.

### 5.2 CI/CD (GitHub Actions)

Deux workflows (`backend-ci-cd.yml`, `frontend-ci-cd.yml`) exécutent, à chaque push :

```
test → build de l'image Docker → push Docker Hub (tag = SHA du commit)
     → bump automatique du tag dans Kustomize (infra/k8s) → commit GitOps → sync Argo CD
```

Un troisième workflow, `security-scan.yml`, exécute un scan IaC dédié. Détails :
[docs/deployment/05-cicd-github-actions.md](deployment/05-cicd-github-actions.md).

### 5.3 Qualité et sécurité du code (Trivy / SonarCloud / Snyk)

- **Trivy** : actif et fonctionnel — scan de vulnérabilités des images dans les deux
  pipelines CI/CD, plus un scan IaC séparé (`security-scan.yml`). Résultats publiés dans
  l'onglet **Security → Code scanning** du dépôt GitHub.
- **SonarCloud** et **Snyk** : intégration câblée dans le code (JaCoCo pour la couverture
  côté backend, `sonar-project.properties` côté frontend) mais **inactive** tant que les
  comptes ne sont pas créés et les secrets `SONAR_TOKEN`/`SNYK_TOKEN` ajoutés au dépôt
  GitHub — prochain chantier documenté dans
  [docs/deployment/10-qualite-securite-code.md](deployment/10-qualite-securite-code.md).

### 5.4 GitOps (Argo CD)

Modèle **App-of-Apps** : une application racine (`hr-root`) synchronise l'application
applicative (`hr-app`), elle-même pointée sur `infra/k8s/overlays/prod` (Kustomize). Tout
changement d'infra ou bump d'image passe par un commit Git, jamais par une commande
`kubectl apply` manuelle en production.

---

## 6. Volet Déploiement (Infrastructure)

### 6.1 Architecture cible

```
Internet
   │
   ▼
Ingress (ingress-nginx + cert-manager, Load Balancer public GCP, TLS Let's Encrypt)
   ├── hr.human-edge.dev        → hr-frontend (nginx, SPA React)
   └── api.hr.human-edge.dev    → hr-backend  (Spring Boot)
                                         │
                                         ▼
                        Cloud SQL MySQL (managé, via Cloud SQL Auth Proxy)

Namespace "hr"          : hr-backend, hr-frontend, hr-ollama (+ PVC uploads, PVC modèles)
Namespace "argocd"      : Argo CD (GitOps)
Namespace "monitoring"  : kube-prometheus-stack (Prometheus + Grafana)

Cluster GKE : Standard, zonal (europe-west1-b) — 1 node pool e2-standard-2 (état réel actuel)
```

### 6.2 Pourquoi GCP/GKE plutôt qu'Azure/AKS ?

Le projet a d'abord été déployé sur **Azure/AKS** (1 seul nœud `Standard_B2ms`, Docker Hub,
MySQL managé via Azure Database Flexible Server) dans le cadre du crédit Azure for
Students. Ce crédit a été épuisé après ce premier déploiement, ce qui a motivé un **pivot
vers GCP/GKE**, financé par les 300$ de crédit d'essai d'un compte GCP jamais utilisé
auparavant. Oracle Cloud Free Tier et DigitalOcean ont été écartés (délais d'approbation
incompatibles avec la deadline). L'architecture Azure reste documentée comme référence
historique.

### 6.3 Infrastructure as Code (Terraform)

`infra/terraform/` provisionne : projet GCP, réseau VPC, cluster GKE (Standard, zonal),
Cloud SQL MySQL, Workload Identity. Le choix **Standard** (plutôt qu'Autopilot) donne un
contrôle direct sur les nœuds — plus pédagogique et prévisible pour un budget fixe.

### 6.4 Kubernetes (Kustomize)

`infra/k8s/base/` définit les manifestes communs (Deployments backend/frontend/Ollama,
Services, Ingress, ConfigMap, PVC). Deux overlays :

- `overlays/prod` — réellement déployé sur GKE, suivi par Argo CD.
- `overlays/dev` — prévu pour un cluster local (kind/minikube), non utilisé simultanément
  avec `prod` pour ne pas doubler le coût des node pools.

### 6.5 Domaine réel

Domaine **`human-edge.dev`** enregistré via Cloud Domains, IP publique du Load Balancer
promue en statique (zéro coupure), zone Cloud DNS avec enregistrements A pour
`hr.human-edge.dev` et `api.hr.human-edge.dev`, certificats TLS Let's Encrypt émis
automatiquement par cert-manager. Détails :
[docs/deployment/08-domaine-reel.md](deployment/08-domaine-reel.md).

### 6.6 Observabilité (Prometheus / Grafana)

`kube-prometheus-stack` (Prometheus, Grafana, node-exporter, kube-state-metrics) installé
avec des values allégées pour tenir sur le nœud unique. Dashboards intégrés au chart
utilisés plutôt qu'un dashboard communautaire externe (incompatibilité constatée avec
cgroup v2 sur les nœuds GKE modernes — voir §9).

### 6.7 Discipline budgétaire opérationnelle

Le cluster n'est pas laissé actif en permanence : routine établie de redimensionnement du
node pool à 0 et mise en pause de Cloud SQL en fin de session, avec redémarrage au début de
la session suivante — voir
[docs/deployment/09-commandes-operationnelles.md](deployment/09-commandes-operationnelles.md).

---

## 7. Sécurité

| Point | État | Détail |
|---|---|---|
| Secrets Kubernetes | ✅ | Sealed Secrets (`kubeseal`) — secrets chiffrés commités en Git, déchiffrables uniquement par le cluster cible |
| Accès base de données | ✅ | **Cloud SQL Auth Proxy en side-car + Workload Identity** : le pod backend s'authentifie par IAM (GSA `hr-backend-sql`, rôle `cloudsql.client`) plutôt que par IP autorisée ou mot de passe réseau exposé. `authorized_networks` entièrement retiré — aucun accès public direct au port MySQL |
| TLS | ✅ | Certificats Let's Encrypt automatiques via cert-manager (`ClusterIssuer letsencrypt-prod`) |
| Scan de vulnérabilités (images + IaC) | ✅ | Trivy actif dans les 3 workflows CI |
| Analyse statique / dépendances | 🔶 | SonarCloud/Snyk câblés, activation en attente de comptes/tokens |
| Compte admin par défaut | ⚠️ | `admin@esprit.tn`/`admin` toujours actif — à changer via la page Profil |
| Migrations de schéma | ⚠️ | `ddl-auto=update` actif même en prod (acceptable pour un labo/démo, Flyway/Liquibase recommandé pour un usage réel) |
| NetworkPolicies | ⚪ | Non livrées (optionnel, cluster mono-nœud/mono-app à exposition déjà limitée) |

**Point fort à valoriser à l'oral** : le passage d'un accès Cloud SQL en IP autorisée
(impraticable — l'IP du nœud change à chaque redimensionnement quotidien) à une
authentification IAM via Workload Identity, sans jamais exposer le port MySQL publiquement.

---

## 8. Budget et gestion des coûts

Le déploiement GCP est volontairement **temporaire et chiffré** plutôt qu'illimité, dans
l'esprit d'un budget étudiant maîtrisé :

| | Valeur |
|---|---|
| Fenêtre de déploiement | 4 semaines (672h) |
| Plafond de dépense auto-imposé | 200 $ |
| Coût estimé du plan retenu | ≈ 173 $ |
| Marge sous le plafond | ≈ 27 $ |
| Crédit d'essai GCP disponible | 300 $ (marge ≈ 127 $) |

Composants retenus au-delà de la config de base : node pool Ollama dédié, autoscaling, IP
publique statique, Cloud Domains, Cloud DNS, disques `pd-balanced`, Cloud Armor, GKE Backup.
**Reportés** faute de marge suffisante : Cloud SQL haute disponibilité (+140 $) et cluster
GKE régional (+67 $) — combinés, ils dépasseraient même le crédit d'essai de 300 $. Arbitrage
assumé : la capacité IA (node pool Ollama séparé) a été jugée plus utile pour une démo qu'une
haute disponibilité du control plane. Chiffrage complet :
[docs/deployment/ressources-budget-gcp.md](deployment/ressources-budget-gcp.md).

Une alerte de budget GCP (150 €, seuils 50/90/100 %) est configurée pour servir de filet de
sécurité.

---

## 9. Difficultés rencontrées et résolues

Cette section illustre le travail de débogage réel effectué — utile pour répondre aux
questions du jury sur les obstacles concrets rencontrés (au-delà de la documentation
« idéale »).

| # | Problème | Cause | Solution |
|---|---|---|---|
| 1 | Argo CD restait en `ComparisonError`, sync bloqué | Patch Kustomize (`overlays/{prod,dev}/patch-configmap.yaml`) sans `namespace: hr`, alors que le ConfigMap de base l'avait — Kustomize ne matchait pas la cible | Ajout du `namespace` manquant dans les patchs |
| 2 | Pod Ollama en `CrashLoopBackOff` | Hook `postStart` utilisait `curl`, absent de l'image `ollama/ollama:latest` actuelle (allégée côté upstream) → échec après 120s → hook `FailedPostStartHook` | Remplacement par le binaire `ollama` lui-même (`ollama list`/`ollama pull`), toujours présent car process principal du conteneur |
| 3 | `JWT_SECRET` invalide en prod | Le secret contenait littéralement la syntaxe shell d'un template (`$(...)`) au lieu d'une vraie valeur aléatoire générée | Génération et injection d'une vraie valeur aléatoire |
| 4 | Upload de CV en échec (`AccessDeniedException`) | Le PVC `uploads` était monté `root:root`, alors que le conteneur backend tourne en utilisateur non-root | Correction des permissions du volume |
| 5 | CI backend en échec (`Permission denied`, exit 126) | `backend/mvnw` avait perdu son bit exécutable en étant commité depuis Windows | `git update-index --chmod=+x backend/mvnw` |
| 6 | Bug de documentation (jamais arrivé en CI réelle, mais piégeux si suivi à la lettre) | La doc du « premier push manuel » retaguait l'image de test locale (`VITE_API_BASE_URL=localhost`) directement en `:latest` prod, sans rebuild avec la vraie URL | Doc corrigée : rebuild explicite avec la bonne URL avant push ; le CI/CD réel n'a jamais eu ce problème (rebuild systématique via une Variable GitHub) |
| 7 | Rolling update du backend systématiquement en échec (`Insufficient cpu`) | Le nœud unique tourne à ~86 % de CPU réservée dès l'ajout du monitoring (kube-prometheus-stack) — l'ancien pod n'est jamais libéré avant que le nouveau devienne `Ready` | Scale manuel de l'ancien ReplicaSet à 0 avant chaque déploiement backend (correctif durable = node pool Ollama dédié, retenu mais pas encore implémenté) |
| 8 | Dashboard Grafana communautaire (ID 315) : tous les panneaux à « N/A » | Le dashboard attend l'agrégat cgroup racine `id="/"`, absent sous cgroup v2 utilisé par les nœuds GKE modernes | Utilisation des dashboards intégrés au chart (`defaultDashboardsEnabled: true`) |
| 9 | Score IA « invisible » côté utilisateur alors que calculé côté backend | Le flux d'évaluation (2 appels Ollama séquentiels, jusqu'à ~180s) dépassait le timeout par défaut d'ingress-nginx (60s) → 504 côté navigateur alors que le backend terminait juste après | `proxy-read-timeout`/`proxy-send-timeout` portés à 240s sur l'Ingress ; vérifié en conditions réelles (200 OK en ~98s) |
| 10 | Accès public direct à Cloud SQL (`0.0.0.0/0`) | IP autorisée impraticable (change à chaque redimensionnement quotidien du node pool) | Cloud SQL Auth Proxy + Workload Identity (voir §7) |
| 11 | Alerte de budget GCP impossible à créer en CLI | Limitation connue de l'API Billing Budgets sur les comptes de facturation « essai gratuit » (`INVALID_ARGUMENT` opaque) | Création via la Console GCP |
| 12 | Workflow GitHub Actions entier en échec au parsing (0 job exécuté) | `if: ${{ secrets.X != '' }}` — `secrets` n'est pas utilisable dans une condition `if:` en GitHub Actions | Retrait de la condition invalide |
| 13 | `trivy-action@0.24.0` introuvable | Tag inexistant — les tags réels du projet sont préfixés `v` (ex. `v0.32.0`) | Version corrigée après vérification via l'API GitHub |
| 14 | Un crash du scanner Trivy (ex. image pas encore disponible côté registre) bloquait tout le déploiement | `exit-code: '0'` ne couvre que les vulnérabilités trouvées, pas un vrai crash du step — sans `continue-on-error`, le job `update-gitops-manifest` (qui dépend d'un job réussi) ne se déclenchait jamais | `continue-on-error: true` ajouté sur les steps de scan Trivy |

---

## 10. Chronologie du projet

| Date | Étape clé |
|---|---|
| 10/07 | Commit initial du projet |
| 22/07 | Bascule sur le domaine réel `human-edge.dev` ; correction des bugs manifestes GitOps (namespace, hook Ollama) et du secret JWT |
| 23/07 | Correction CI (`mvnw`), correction des permissions PVC uploads |
| 24/07 | Ajout de la fonctionnalité « mot de passe oublié » |
| 27/07 | Cloud SQL Auth Proxy + Workload Identity ; retrait de l'accès public à la base ; correction du timeout ingress pour l'évaluation IA |
| 28/07 | Intégration Trivy (actif) + SonarCloud/Snyk (prêts) ; README + scénario de démo avec captures d'écran ; **rapport de soutenance** |

*(Chronologie limitée à l'historique Git conservé dans le dépôt actuel ; le premier
déploiement Azure/AKS, antérieur au pivot GCP, n'y figure pas mais reste documenté comme
référence historique — voir §6.2.)*

---

## 11. Démonstration

Scénario de démo complet avec captures d'écran réelles de l'application déployée :
[docs/demo.md](demo.md). Résumé du parcours proposé :

1. Page de connexion (`/login`)
2. Connexion admin → tableau de bord plateforme (entreprises, effectifs, abonnements, MRR)
3. Offres d'emploi (liste + création live)
4. **Évaluation IA d'une candidature** (fonctionnalité phare — prévoir 30 à 90s d'inférence
   CPU-only, bon moment pour expliquer l'architecture pendant le chargement)
5. Fiche candidats (profil, CV en pièce jointe)
6. Mot de passe oublié (lien email, token à usage unique)
7. Optionnel si le temps le permet : MFA par email (création d'un compte `COMPANY`),
   architecture infra complète (GKE/Terraform/Argo CD/CI-CD/monitoring), Cloud SQL Auth Proxy

> Le cluster étant redimensionné à 0 nœud entre deux sessions pour économiser le crédit GCP,
> il faut le rallumer avant la démo — voir
> [docs/deployment/09-commandes-operationnelles.md](deployment/09-commandes-operationnelles.md).

---

## 12. Bilan, limites et perspectives

### Ce qui a été livré et fonctionne réellement en production

- Application complète (RH + recrutement assisté par IA) déployée et accessible publiquement
- Infrastructure as Code (Terraform), GitOps (Argo CD), CI/CD (GitHub Actions) opérationnels
  de bout en bout, pas seulement documentés
- Nom de domaine réel, TLS automatique, IP statique
- Sécurisation de l'accès base de données par IAM (Workload Identity)
- Scan de vulnérabilités actif (Trivy) sur images et IaC
- Observabilité (Prometheus/Grafana)
- Budget chiffré, suivi et maîtrisé (≈173$/200$ plafond sur 4 semaines)

### Limites connues (points ouverts, assumés et documentés)

- Mot de passe admin par défaut toujours actif (à changer manuellement)
- SonarCloud/Snyk câblés mais pas encore activés (tokens manquants)
- Node pool Ollama dédié, autoscaling, Cloud Armor, GKE Backup : retenus dans le chiffrage
  budgétaire mais pas encore implémentés dans le Terraform
- Cluster GKE zonal (pas régional) et Cloud SQL sans haute disponibilité — arbitrage
  budgétaire assumé, pas une omission
- Incohérence connue entre l'email de connexion et l'email de profil du candidat de
  démonstration en base (comportement anti-oracle voulu, source de confusion pour la démo —
  préférer créer un nouveau compte candidat)
- `ddl-auto=update` actif en prod (acceptable pour une démo, à remplacer par Flyway/Liquibase
  pour un usage réel)

### Perspectives

- Activer SonarCloud/Snyk pour compléter la chaîne qualité/sécurité du code
- Implémenter le node pool Ollama dédié pour lever la tension CPU chronique du nœud unique
  et permettre un modèle IA plus grand (`llama3.1:latest` 8B)
- `terraform destroy` en fin d'expérimentation pour ne pas consommer inutilement le crédit
  d'essai une fois le projet évalué

---

## 13. Annexes

### Documentation complète du dépôt

| Document | Contenu |
|---|---|
| [docs/deployment/00-overview.md](deployment/00-overview.md) | Vue d'ensemble architecture + budget |
| [docs/deployment/01-containerization.md](deployment/01-containerization.md) | Dockerfiles, build/test local |
| [docs/deployment/02-terraform-gke.md](deployment/02-terraform-gke.md) | Provisionnement GCP (projet, GKE, Cloud SQL) |
| [docs/deployment/03-secrets.md](deployment/03-secrets.md) | Sealed Secrets, secrets applicatifs |
| [docs/deployment/04-kubernetes-gitops.md](deployment/04-kubernetes-gitops.md) | Argo CD, premier déploiement |
| [docs/deployment/05-cicd-github-actions.md](deployment/05-cicd-github-actions.md) | Pipelines CI/CD détaillés |
| [docs/deployment/06-monitoring.md](deployment/06-monitoring.md) | Prometheus + Grafana |
| [docs/deployment/07-checklist-securite-budget.md](deployment/07-checklist-securite-budget.md) | Checklist sécurité/budget |
| [docs/deployment/08-domaine-reel.md](deployment/08-domaine-reel.md) | Migration vers un vrai nom de domaine |
| [docs/deployment/09-commandes-operationnelles.md](deployment/09-commandes-operationnelles.md) | Aide-mémoire commandes courantes |
| [docs/deployment/10-qualite-securite-code.md](deployment/10-qualite-securite-code.md) | Intégration SonarQube/Snyk/Trivy |
| [docs/deployment/ressources-budget-gcp.md](deployment/ressources-budget-gcp.md) | Chiffrage détaillé des ressources GCP |
| [docs/recap-deploiement-gke.md](recap-deploiement-gke.md) | Récapitulatif condensé du déploiement |
| [docs/demo.md](demo.md) | Scénario de démo avec captures d'écran |

### Chiffres clés

- **12** contrôleurs REST backend, **21** pages frontend
- **94** fichiers Java, **59** fichiers TypeScript/TSX
- **3** workflows CI/CD GitHub Actions
- **14** bugs réels identifiés et corrigés pendant la phase infra/déploiement (voir §9)
- **1** application déployée en production sur un vrai nom de domaine avec TLS
