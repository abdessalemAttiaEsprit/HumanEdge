# 10. Qualité de code & sécurité (SonarQube, Snyk, Trivy)

> **Statut : plan, rien n'est encore implémenté.** Ce chapitre documente ce qui sera fait
> ensuite - contrairement aux chapitres précédents (00-09), il ne décrit pas des commandes
> déjà exécutées mais une proposition d'intégration, à valider avant de toucher aux workflows
> GitHub Actions existants (`.github/workflows/backend-ci-cd.yml`/`frontend-ci-cd.yml`).

## 10.0 Pourquoi ces 3 outils, et pourquoi pas un seul

Ils couvrent 3 questions différentes, pas la même chose sous 3 marques :

| Outil | Question à laquelle il répond | Analyse |
|---|---|---|
| **SonarQube** (SonarCloud) | Le code est-il maintenable/testé/propre ? | Qualité statique : bugs potentiels, code smells, duplication, couverture de tests |
| **Trivy** | L'image Docker ou les manifestes IaC ont-ils des vulnérabilités/misconfigurations connues ? | Scan de vulnérabilités (CVE) + scan de configuration (Dockerfile, K8s, Terraform) |
| **Snyk** | Les dépendances (Maven/npm) et l'IaC ont-ils des vulnérabilités, avec un correctif suggéré ? | Scan de dépendances + IaC, avec tableau de bord web et suggestions de fix |

Trivy et Snyk se recoupent partiellement (scan d'image, scan IaC) - ce n'est pas une
redondance à éliminer mais une garde à deux niveaux : Trivy est gratuit/illimité/sans compte
et donc adapté à un usage **bloquant** en CI (fail le build), Snyk apporte un tableau de bord
persistant et des suggestions de correctif plus riches mais avec un quota gratuit limité,
donc mieux adapté à une revue **périodique** plutôt qu'à chaque commit.

## 10.1 Trivy — à implémenter en premier (gratuit, sans compte, sans token)

[Trivy](https://github.com/aquasecurity/trivy) (Aqua Security) est open source, ne nécessite
aucune inscription ni secret GitHub, et scanne 3 choses utiles ici :

1. **Images Docker** (`hr-backend`, `hr-frontend`) juste après le build, avant le push.
2. **Manifestes Kubernetes** (`infra/k8s/**`) - misconfigurations (ex : conteneur qui tourne
   en root, absence de `resources.limits`, `hostNetwork` activé...).
3. **Terraform** (`infra/terraform/**`) - misconfigurations (ex : c'est ce type de scan qui
   aurait détecté l'accès public `0.0.0.0/0` sur Cloud SQL avant qu'il ne soit corrigé
   manuellement, voir [07-checklist-securite-budget.md](07-checklist-securite-budget.md)).

Intégration proposée (`aquasecurity/trivy-action`), ajoutée comme étape dans
`build-test-push` de chaque workflow, **après** le build de l'image et **avant** le push :

```yaml
      - name: Build image (sans push, pour le scanner d'abord)
        uses: docker/build-push-action@v6
        with:
          context: backend
          push: false
          load: true
          tags: ${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }}

      - name: Scan image (Trivy)
        uses: aquasecurity/trivy-action@0.24.0
        with:
          image-ref: ${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }}
          severity: CRITICAL
          exit-code: '1'   # fait échouer le job si une faille CRITICAL est trouvée

      - name: Push image (si le scan est passé)
        uses: docker/build-push-action@v6
        with:
          context: backend
          push: true
          tags: |
            ${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }}
            ${{ env.IMAGE_NAME }}:latest
```

Scan IaC (Terraform + Kubernetes), en job séparé, indépendant du build d'image :

```yaml
  scan-iac:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Scan Terraform + Kubernetes (Trivy config)
        uses: aquasecurity/trivy-action@0.24.0
        with:
          scan-type: config
          scan-ref: infra
          severity: CRITICAL,HIGH
          exit-code: '0'   # ne bloque pas au début - voir 10.5 sur la stratégie de gate
```

**Recommandation** : commencer avec `severity: CRITICAL` uniquement et `exit-code: '1'`
seulement sur le scan d'image (bloquant), et `exit-code: '0'` (rapport seul, non bloquant) sur
le scan IaC le temps de faire le tri sur les résultats existants - un premier scan sur un
projet jamais scanné remonte presque toujours des dizaines de findings `HIGH` historiques,
et un `exit-code: '1'` immédiat bloquerait la CI dès le premier commit après l'intégration.

## 10.2 SonarQube (via SonarCloud, pas d'hébergement à gérer)

Le repo GitHub (`HumanEdge`) est déjà **public** (nécessaire pour Argo CD, voir le
récapitulatif). [SonarCloud](https://sonarcloud.io) est **gratuit pour les repos publics** -
pas besoin d'auto-héberger un serveur SonarQube (qui coûterait de la RAM sur le nœud GKE déjà
sous tension, voir [06-monitoring.md §6.7](06-monitoring.md#67-effet-de-bord-vécu--capacité-cpu-chroniquement-tendue)).

Mise en place :
1. Se connecter sur [sonarcloud.io](https://sonarcloud.io) avec le compte GitHub, importer le
   repo `HumanEdge`. SonarCloud propose de créer 1 projet par langage détecté - garder
   **2 projets séparés** (`hr-backend`, `hr-frontend`), pas un seul, vu que Java et TS ont des
   analyseurs et des règles différentes.
2. Générer un token (My Account > Security) → secret GitHub `SONAR_TOKEN`.
3. Backend (Maven, plugin officiel) :
```yaml
      - name: SonarCloud (backend)
        working-directory: backend
        run: ./mvnw -B verify org.sonarsource.scanner.maven:sonar-maven-plugin:sonar
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        # nécessite sonar.projectKey/sonar.organization dans backend/pom.xml
        # (<properties><sonar.projectKey>...</sonar.projectKey></properties>)
```
`verify` (pas juste `test`) est nécessaire pour que JaCoCo génère le rapport de couverture
que Sonar peut ensuite lire - à ajouter dans `backend/pom.xml` si pas déjà présent
(plugin `jacoco-maven-plugin`).

4. Frontend (scanner CLI générique, pas de build Maven ici) :
```yaml
      - name: SonarCloud (frontend)
        uses: SonarSource/sonarcloud-github-action@v3
        with:
          projectBaseDir: frontend
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

Le "Quality Gate" par défaut de SonarCloud (couverture, duplication, bugs bloquants) peut être
configuré pour ne pas faire échouer la CI dans un premier temps - voir 10.5.

## 10.3 Snyk (compte gratuit, token requis)

[Snyk](https://snyk.io) a un tier gratuit pour projets open source. Couvre les dépendances
(`backend/pom.xml`, `frontend/package.json`) et l'IaC (`infra/terraform/**`).

Mise en place :
1. Créer un compte gratuit sur [snyk.io](https://snyk.io) (login GitHub possible), lier le repo.
2. Récupérer le token (Account Settings > API Token) → secret GitHub `SNYK_TOKEN`.
3. Backend :
```yaml
      - name: Snyk (dépendances backend)
        uses: snyk/actions/maven@master
        with:
          args: --file=backend/pom.xml --severity-threshold=high
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```
4. Frontend :
```yaml
      - name: Snyk (dépendances frontend)
        uses: snyk/actions/node@master
        with:
          args: --file=frontend/package.json --severity-threshold=high
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```
5. IaC (Terraform), en complément du scan de config Trivy (10.1) - Snyk a une base de règles
   différente et un tableau de bord web pour suivre l'évolution dans le temps :
```yaml
      - name: Snyk (Terraform)
        uses: snyk/actions/iac@master
        with:
          args: infra/terraform --severity-threshold=high
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

## 10.4 Où ça s'insère dans les workflows existants

Aucun de ces outils ne touche à GCP/GKE (même principe que le reste de la CI, voir
[05-cicd-github-actions.md](05-cicd-github-actions.md) : aucun credential cloud dans GitHub
Actions). Emplacement recommandé :

- **Trivy image scan** + **Snyk dépendances** : nouvelles étapes dans le job existant
  `build-test-push` de `backend-ci-cd.yml`/`frontend-ci-cd.yml`, après les tests et avant le
  push Docker Hub - un échec bloque alors `update-gitops-manifest` (qui `needs:
  build-test-push`), donc empêche une image vulnérable de finir déployée.
- **Trivy config** + **Snyk IaC** + **SonarCloud** : nouveau job séparé (ex `code-quality`,
  indépendant de `build-test-push`, sans `needs` entre eux) - ce sont des analyses de code
  source, pas liées à l'image buildée, pas besoin de bloquer le pipeline principal dessus au
  début (voir stratégie de gate ci-dessous).

## 10.5 Stratégie de gate recommandée (progressive, pas tout bloquant dès le jour 1)

Un projet jamais scanné remonte toujours un grand nombre de findings historiques. Tout rendre
bloquant immédiatement bloquerait la CI en continu sans plus-value (personne ne corrige 40
findings d'un coup). Ordre recommandé :

1. **Semaine 1** : tous les scans en mode rapport seul (`exit-code: '0'` / pas de
   `severity-threshold`), pour avoir une photo de l'état actuel sans bloquer personne.
2. **Semaine 2** : rendre **Trivy image scan** bloquant sur `CRITICAL` uniquement (c'est le
   scan le plus fiable/le moins bruyant, zéro faux positif habituellement sur des CVE connues).
3. **Ensuite** : étendre progressivement (Trivy `HIGH`, puis Snyk dépendances, puis Quality
   Gate SonarCloud) au fur et à mesure que les findings existants sont traités ou explicitement
   ignorés (`.trivyignore`, exclusions Snyk, `sonar-project.properties`).

## 10.6 Secrets GitHub à ajouter (récapitulatif)

| Nom | Origine | Utilisé par |
|---|---|---|
| `SONAR_TOKEN` | sonarcloud.io > My Account > Security | job SonarCloud (backend + frontend) |
| `SNYK_TOKEN` | app.snyk.io > Account Settings > API Token | jobs Snyk (dépendances + IaC) |

(Trivy ne nécessite aucun secret - c'est un des critères qui en fait le premier outil à
brancher.)
