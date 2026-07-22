# 2. Terraform — provisionner GCP (projet, GKE, Cloud SQL)

> Les commandes ci-dessous sont données en **bash**. En PowerShell, remplace
> `export VAR=valeur` par `$env:VAR = "valeur"` (les `$env:` sont déjà globales à la
> session, pas besoin d'`export`). Le reste (`gcloud`, `terraform`, `kubectl`) s'exécute à
> l'identique dans les deux shells.

Chaque section ci-dessous explique non seulement **quoi taper**, mais **ce que fait chaque
commande** - l'objectif est que tu puisses la retaper de mémoire dans un autre contexte, pas
juste la copier-coller ici.

## 2.1 Créer le projet GCP et s'authentifier

```bash
gcloud auth login
```
- Ouvre un navigateur, te connecte avec ton compte Google, et stocke un jeton d'accès local
  (`~/.config/gcloud`) que toutes les commandes `gcloud` suivantes réutilisent - une seule
  fois par machine, pas besoin de refaire cette commande à chaque session.

```bash
gcloud projects create hrapp-471203 --name="HR App"
```
- `gcloud projects create` : crée un nouveau projet GCP, l'équivalent du resource group
  Azure mais au niveau le plus haut (toutes les ressources - GKE, Cloud SQL, réseau -
  vivront dedans).
- `hrapp-471203` : l'**ID** du projet, pas son nom d'affichage - doit être **globalement
  unique** sur tout GCP, 6-30 caractères, minuscules/chiffres/tirets. Si `hrapp` est déjà
  pris, `gcloud` propose un suffixe aléatoire ou tu en inventes un toi-même (ex:
  `hrapp-<tes-initiales>-2026`). C'est cette valeur qui ira dans `project_id` de
  `terraform.tfvars`.
- `--name="HR App"` : le nom lisible affiché dans la console web - purement cosmétique,
  peut différer de l'ID.

```bash
gcloud config set project hrapp-471203
```
- Définit `hrapp-471203` comme projet **par défaut** pour toutes les commandes `gcloud`
  suivantes de cette session - évite de répéter `--project=hrapp-471203` à chaque fois.

```bash
gcloud billing accounts list
```
- Liste les comptes de facturation associés à ton compte Google (le compte de facturation
  d'essai créé automatiquement quand tu as activé les 300$ de crédit). Note la colonne
  `ACCOUNT_ID` (format `XXXXXX-XXXXXX-XXXXXX`) de la ligne où `OPEN` vaut `True`.
ACCOUNT_ID: 01B6F9-3CB3E2-6EB064
```bash
gcloud billing projects link hrapp-471203 --billing-account=01B6F9-3CB3E2-6EB064
```
- Un projet neuf n'est **rattaché à aucune facturation** par défaut - sans cette commande
  (ou l'équivalent dans la console web, Facturation > Lier un compte de facturation),
  `terraform apply` échouera au moment d'activer les APIs (étape 2.4) avec une erreur
  explicite (`Billing account for project is not found`).

## 2.2 Bootstrap du bucket GCS pour le state Terraform

Terraform a besoin d'un endroit pour stocker son state avant même de pouvoir créer quoi que
ce soit d'autre - un bucket Google Cloud Storage (l'équivalent du storage account Azure). On
le crée à la main, une seule fois :

```bash
gsutil mb -p hrapp-471203 -l europe-west1 gs://tfstate-hrapp-471203
```
- `gsutil mb` (**m**ake **b**ucket) : crée un bucket GCS.
- `-p hrapp-471203` : le projet qui possédera (et paiera, coût négligeable ici) le bucket.
- `-l europe-west1` : la région du bucket - la faire correspondre à `var.region` de
  `terraform.tfvars` évite une latence inutile entre le state et les ressources qu'il
  décrit.
- `gs://tfstate-hrapp-471203` : le nom du bucket doit lui aussi être **globalement unique**
  sur tout GCP (comme les noms de projet) - `tfstate-<ton-project-id>` est une convention
  simple qui garantit l'unicité si le project ID l'est déjà.

```bash
gsutil versioning set on gs://tfstate-hrapp-471203
```
- Active le versioning sur le bucket : chaque écriture du state Terraform garde les
  versions précédentes au lieu de les écraser. Filet de sécurité peu coûteux (quelques Ko)
  si un `apply` corrompt le state - tu peux restaurer une version antérieure.

## 2.3 Configurer Terraform

```bash
cd infra/terraform
cp backend.hcl.example backend.hcl
# édite backend.hcl : bucket = "tfstate-hrapp-471203" (valeur de l'étape 2.2)

cp terraform.tfvars.example terraform.tfvars
# édite terraform.tfvars : project_id = "hrapp-471203" (valeur de l'étape 2.1)

export TF_VAR_mysql_admin_password="un-mot-de-passe-fort-genere"
```
- `backend.hcl` : config du backend distant (bucket GCS) - séparée de `terraform.tfvars`
  car Terraform doit la connaître **avant** même de lire les fichiers `.tf` (au moment de
  `terraform init`, qui vient ensuite).
- `terraform.tfvars` : valeurs des `variable` définies dans `variables.tf` (project_id,
  region, prefix...).
- `TF_VAR_mysql_admin_password` : Terraform lit automatiquement toute variable d'env
  préfixée `TF_VAR_` et la mappe sur la variable Terraform de même nom
  (`mysql_admin_password`) - permet de fournir un secret **sans** l'écrire dans un fichier,
  donc sans risque de le commiter par erreur.

`backend.hcl` et `terraform.tfvars` sont dans `.gitignore` - ils ne seront jamais commités.

## 2.4 Init / plan / apply

```bash
terraform init -backend-config backend.hcl
```
- Télécharge le provider `google` (déclaré dans `providers.tf`), et configure le backend
  distant `gcs` avec les valeurs de `backend.hcl` - le state (`terraform.tfstate`) sera lu/
  écrit dans le bucket GCS, jamais uniquement en local.

```bash
terraform validate
```
- Vérifie la syntaxe et la cohérence interne des fichiers `.tf` (types de variables,
  références entre ressources) **sans** contacter GCP - rapide, à lancer après chaque
  modification avant de passer à `plan`.

```bash
terraform plan -out=tfplan
```
- Calcule le diff entre l'état désiré (les fichiers `.tf`) et l'état réel actuel sur GCP
  (interrogé via l'API), sans rien modifier. `-out=tfplan` sauvegarde ce plan dans un
  fichier binaire pour être certain que l'`apply` suivant applique **exactement** ce qui a
  été relu, même si l'état GCP change entre les deux commandes.

```bash
terraform apply tfplan
```
- Exécute le plan sauvegardé : active les APIs GCP (`project.tf`), crée le VPC/subnet
  (`network.tf`), le cluster GKE + son node pool (`gke.tf`), l'instance Cloud SQL
  (`cloudsql.tf`). Prend 5 à 10 minutes - le cluster GKE et l'instance Cloud SQL sont les
  ressources les plus longues à provisionner.

> Si `apply` échoue sur les toutes premières ressources (`google_project_service`) avec une
> erreur du type "API not enabled" alors que la commande vient de l'activer : l'activation
> d'une API met parfois quelques dizaines de secondes à se propager. Relance simplement
> `terraform apply tfplan`.

## 2.5 Récupérer les accès

```bash
gcloud container clusters get-credentials hrapp-gke --zone europe-west1-b --project hrapp-471203
```
- Récupère les identifiants du cluster GKE (endpoint de l'API + certificat) et les fusionne
  dans `~/.kube/config` - c'est ce fichier que `kubectl` lit ensuite pour savoir à quel
  cluster parler. `--zone` doit correspondre à `var.zone` (cluster **zonal**, pas
  `--region`).

```bash
kubectl get nodes
# doit afficher 1 nœud e2-standard-2 en Ready
```
- Confirme que `kubectl` peut effectivement joindre le cluster et que le node pool
  (`gke.tf`) est monté et prêt à recevoir des pods.

```bash
terraform output mysql_public_ip
terraform output mysql_database_name
```
- Relit les `output` définis dans `outputs.tf` depuis le state (pas besoin de retourner
  dans la console GCP). Note l'IP publique Cloud SQL : elle sert à construire `DB_URL` à
  l'étape suivante ([03-secrets.md](03-secrets.md)) :
```
jdbc:mysql://<mysql_public_ip>:3306/Hr?useSSL=true&serverTimezone=UTC
```

## 2.6 Discipline budget : redimensionner le node pool entre deux sessions

GKE n'a pas d'équivalent direct d'`az aks stop` (qui met en pause le cluster entier côté
Azure). Côté GCP, le control plane d'un cluster zonal est déjà gratuit (voir
[00-overview.md](00-overview.md#budget)) - le seul coût horaire réel est le node pool. Pour
ne pas payer le nœud pendant les heures inutilisées, on le redimensionne à 0 :

```bash
gcloud container clusters resize hrapp-gke --node-pool=system \
  --num-nodes=0 --zone=europe-west1-b --quiet
```
- `resize` : change le nombre de nœuds du pool nommé `system` (celui défini dans `gke.tf`)
  sans supprimer le cluster ni son control plane - juste les VM Compute Engine sous-
  jacentes.
- `--num-nodes=0` : supprime la seule VM du pool. Tous les pods qui tournaient dessus
  (backend, frontend, Ollama, Argo CD, monitoring) sont arrêtés - normal, c'était le but.
- `--quiet` : évite la confirmation interactive `y/N` (utile en script, sinon `gcloud`
  demande confirmation avant de retirer un nœud avec des pods dessus).

```bash
# ... plus tard, pour reprendre le travail :
gcloud container clusters resize hrapp-gke --node-pool=system \
  --num-nodes=1 --zone=europe-west1-b --quiet
gcloud container clusters get-credentials hrapp-gke --zone europe-west1-b --project hrapp-471203
```
- Recrée une VM et Kubernetes replanifie automatiquement tous les pods dessus (aucune
  action manuelle nécessaire, c'est le rôle normal du scheduler) - compte 2-3 minutes pour
  que tout redevienne `Running`. Le second `get-credentials` n'est utile que si ton
  `~/.kube/config` a expiré ou changé de machine entre-temps.

Cloud SQL peut lui aussi être mis en pause (la VM sous-jacente, pas le stockage - le disque
continue d'être facturé, mais c'est un montant marginal) :

```bash
gcloud sql instances patch hrapp-mysql --activation-policy=NEVER
# ... plus tard :
gcloud sql instances patch hrapp-mysql --activation-policy=ALWAYS
```
- `--activation-policy=NEVER` : éteint l'instance (plus de facturation compute) - le
  backend ne pourra plus se connecter tant qu'elle n'est pas rallumée.
- `--activation-policy=ALWAYS` : la redémarre (retour à l'état par défaut après création).

Compte tenu de la marge budgétaire confortable sur 2 semaines (voir
[00-overview.md](00-overview.md#budget)), cette discipline d'arrêt est **optionnelle** ici -
utile si tu préfères garder un maximum de marge, pas strictement nécessaire pour tenir le
budget.
