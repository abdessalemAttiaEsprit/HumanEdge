# 7. Checklist sécurité & budget

À parcourir avant de considérer ce déploiement comme autre chose qu'un labo/démo.

## Sécurité

- [ ] **Compte admin par défaut** (`admin@esprit.tn` / `admin`) : un `CommandLineRunner`
  le crée automatiquement si la table users est vide, quel que soit le profil. Dès le
  premier déploiement réussi, connecte-toi et **change ce mot de passe immédiatement**
  (ou crée un vrai compte admin et supprime celui-ci).
- [ ] **`spring.jpa.hibernate.ddl-auto=update`** est actif même en prod (hérité de
  `application.properties`, jamais surchargé dans `application-prod.properties`) - Hibernate
  peut modifier le schéma automatiquement au démarrage. Acceptable pour un labo/démo ; pour
  un vrai usage, passer à `validate` + un outil de migration (Flyway/Liquibase) est
  recommandé, mais hors périmètre de cette phase infra.
- [ ] **Cloud SQL en accès public** (`google_sql_database_instance.this` dans
  `infra/terraform/cloudsql.tf`, réseau autorisé `0.0.0.0/0`) : simplifie le setup (pas de
  VPC privé/Private Service Connect à gérer) mais ouvre l'instance à toute IP sur Internet
  (protégée uniquement par le login/mot de passe MySQL). Pour resserrer, une fois l'IP de
  sortie du cluster connue :
  ```bash
  # Trouver l'IP externe (éphémère) du nœud - change si le nœud est recréé
  kubectl get nodes -o wide
  gcloud compute instances describe <nom-de-la-vm> --zone=europe-west1-b \
    --format="value(networkInterfaces[0].accessConfigs[0].natIP)"

  gcloud sql instances patch hrapp-mysql \
    --authorized-networks=<IP-trouvée-ci-dessus>/32
  ```
  Solution plus robuste mais plus lourde (hors périmètre ici) : réserver une IP statique
  pour le nœud, ou passer par le Cloud SQL Auth Proxy en side-car.
- [ ] **Rotation des secrets** : pour changer `JWT_SECRET`, `DB_PASSWORD`, `MAIL_PASSWORD`,
  refaire la procédure de [03-secrets.md](03-secrets.md) (nouveau `kubectl create secret
  --dry-run=client` → `kubeseal` → commit), puis forcer un redémarrage des pods pour
  prendre en compte le nouveau secret : `kubectl -n hr rollout restart deployment/hr-backend`.
- [ ] **NetworkPolicies** (optionnel, pas livré ici) : par défaut tout pod du cluster peut
  contacter tout autre pod. Pour un cluster mono-nœud/mono-app, l'exposition réelle est
  limitée, mais une NetworkPolicy restreignant l'ingress vers `hr-backend` au seul
  `hr-frontend` + ingress-nginx serait la suite logique.

## Ollama (IA) - points de vigilance

- [ ] **Modèle volontairement petit** (`llama3.2:3b`, ~2 Go quantifié, piloté par
  `OLLAMA_MODEL` dans `infra/k8s/base/configmap.yaml`) : `hr-ollama` partage le nœud unique
  `e2-standard-2` (8 Go) avec backend/frontend/Argo CD/monitoring - passer à `llama3.1:latest`
  (8B, ~4,7 Go) reste possible en changeant cette seule valeur, mais c'est nettement plus
  tendu en mémoire sur ce nœud (`kubectl top pods -n hr` pour vérifier après le switch).
- [ ] **CPU only** : 2 vCPU partagés pour tout le nœud → inférence lente (quelques
  tokens/seconde). Attendu pour ce budget ; si besoin de vitesse, il faudrait un node pool
  dédié avec plus de vCPU (voir note dans [00-overview.md](00-overview.md) sur le choix
  d'un nœud unique plutôt que deux node pools).
- [ ] **Premier démarrage plus long** : le hook `postStart` de `hr-ollama` télécharge le
  modèle au premier lancement (peut prendre plusieurs minutes) - `kubectl -n hr logs
  deploy/hr-ollama` pour suivre, le modèle est ensuite persisté dans le PVC
  `hr-ollama-models` et n'est pas re-téléchargé aux redémarrages suivants (sauf si tu
  redimensionnes le node pool à 0 **et** que le PVC est recréé - avec `pd-standard` en
  `ReadWriteOnce`, le disque survit normalement à un redémarrage du pod, pas à sa
  suppression).
- [x] **Timeout RestTemplate** : `RestTemplateConfig` fixe désormais 5s de connexion / 90s
  de lecture pour les appels à Ollama, pour ne pas bloquer indéfiniment un thread de
  requête backend si Ollama est lent ou indisponible.

## Budget

- [ ] **Alerte de budget GCP** : configure une alerte avant de te rapprocher des 300$ de
  crédit d'essai (large marge prévue, voir [00-overview.md](00-overview.md#budget), mais
  une alerte reste un filet de sécurité gratuit) :
  ```bash
  gcloud billing budgets create \
    --billing-account=<ACCOUNT_ID, voir 02-terraform-gke.md#21> \
    --display-name="hr-budget" \
    --budget-amount=250USD \
    --threshold-rule=percent=0.5 \
    --threshold-rule=percent=0.9
  ```
  - `--budget-amount=250USD` : seuil de référence pour les alertes (pas un plafond dur -
    GCP n'arrête jamais automatiquement les ressources), fixé sous les 300$ du crédit pour
    garder de la marge.
  - `--threshold-rule=percent=0.5` / `0.9` (répétable) : déclenche un email aux
    administrateurs de facturation à 50% (125$) et 90% (225$) de `--budget-amount` atteints.
  - Alternative plus visuelle : Console GCP > Facturation > Budgets et alertes > Créer un
    budget.
- [ ] **Redimensionner le node pool à 0 entre les sessions** (optionnel vu la marge
  budgétaire, voir [02-terraform-gke.md](02-terraform-gke.md#26-discipline-budget--redimensionner-le-node-pool-entre-deux-sessions)) -
  le nœud GKE est le poste de coût le plus élevé.
- [ ] **Rate limits Docker Hub** : la CI pousse des tags basés sur le SHA du commit (jamais
  `latest` pour le déploiement réel), et Kubernetes n'utilise `imagePullPolicy: IfNotPresent`
  par défaut que pour les tags non-`latest` - donc chaque image n'est retirée qu'une seule
  fois par nœud tant que le tag ne change pas. Le tier gratuit Docker Hub devrait largement
  suffire pour un cluster mono-nœud à faible trafic.
- [ ] **Fin de l'expérimentation (deadline 2 semaines)** : à la fin de la période,
  ```bash
  cd infra/terraform
  terraform destroy
  ```
  (avec les mêmes `backend.hcl`/`terraform.tfvars` que pour l'`apply` initial) - supprime
  cluster GKE, node pool, instance Cloud SQL et réseau, pour ne pas continuer à consommer
  le crédit d'essai inutilement une fois le déploiement démontré. `terraform destroy` relit
  le state depuis le bucket GCS (`backend.hcl`) : ne le lance jamais depuis une autre
  machine sans avoir d'abord `terraform init -backend-config=backend.hcl` dessus.
