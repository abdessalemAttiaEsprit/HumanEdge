# 8. Passage au domaine réel (human-edge.dev)

Ce chapitre remplace le fichier `hosts` local (étape provisoire du chapitre 4) par un vrai
domaine public : `human-edge.dev`, enregistré via Cloud Domains, avec Cloud DNS et un
certificat TLS réel via cert-manager (déjà installé, voir [04-kubernetes-gitops.md](04-kubernetes-gitops.md)).
Ces 3 ressources (IP statique, Cloud Domains, Cloud DNS) sont déjà budgétées dans
[ressources-budget-gcp.md](ressources-budget-gcp.md#2-am%C3%A9liorations-possibles-marge-budg%C3%A9taire-disponible)
(statut **Retenu**, ≈173$/4 semaines déjà inclus).

## 8.1 Réserver l'IP publique en statique (fait)

```bash
gcloud compute addresses create hrapp-ingress-ip --region=europe-west1 --addresses=34.62.103.210
```

- `--addresses=34.62.103.210` : au lieu de réserver une **nouvelle** IP, on "promeut" l'IP
  éphémère déjà attribuée au `Service type=LoadBalancer` d'ingress-nginx en IP **statique** -
  même adresse, aucune coupure de service, pas besoin de recréer le Service ni de changer
  les entrées DNS ensuite.
- Sans `--addresses`, `gcloud` aurait réservé une IP différente, qu'il aurait ensuite fallu
  réinjecter dans le Service via `--set controller.service.loadBalancerIP=...` (Helm) - plus
  d'étapes, et un changement d'IP visible.
- Vérifié : `status: IN_USE` (déjà utilisée par le Load Balancer, mais maintenant réservée -
  ne sera jamais réattribuée à autre chose ni libérée tant qu'elle n'est pas explicitement
  supprimée).

## 8.2 Enregistrer le domaine via Cloud Domains (fait)

Fait via Console GCP (nécessitait les vraies coordonnées de contact de l'utilisateur -
non automatisable). `humanedge.com` et `humanedge.dev` étaient indisponibles/déjà envisagés
différemment ; domaine finalement enregistré : **`human-edge.dev`** (12,00 $/an,
renouvellement automatique, expire le 2027-07-22, protection WHOIS activée).

Fournisseur DNS choisi pendant l'enregistrement : **Cloud DNS** - la zone a été créée
automatiquement (voir 8.3), pas besoin de la créer/relier les nameservers à la main.

> **Pourquoi `.dev` impose HTTPS dès le début** : `.dev` fait partie de la liste **HSTS
> preload** intégrée aux navigateurs (Chrome, Firefox...) - ils refusent toute connexion en
> HTTP et forcent direct en HTTPS, avant même la première visite. Ça n'affecte **pas**
> l'obtention du certificat : la validation Let's Encrypt (HTTP-01, voir 8.5) est faite par
> un serveur, pas un navigateur, donc elle n'est pas soumise à cette règle. Concrètement :
> rien à faire de plus, mais il ne faut pas s'étonner qu'un `curl http://...` sans `-L` ou un
> navigateur refuse le HTTP - c'est voulu.

## 8.3 Zone Cloud DNS + enregistrements A (fait)

La zone a été créée automatiquement par Cloud Domains pendant l'enregistrement :

```bash
gcloud dns managed-zones list
# NAME: human-edge-dev   DNS_NAME: human-edge.dev.   VISIBILITY: public
```

Enregistrements `A` ajoutés vers l'IP statique de 8.1 :

```bash
gcloud dns record-sets create hr.human-edge.dev. --zone=human-edge-dev --type=A --ttl=300 --rrdatas=34.62.103.210
gcloud dns record-sets create api.hr.human-edge.dev. --zone=human-edge-dev --type=A --ttl=300 --rrdatas=34.62.103.210
```

- `--ttl=300` (5 min) : volontairement court pendant la mise en place, pour propager vite un
  changement d'IP si besoin - à remonter (ex. 3600) une fois l'infra stabilisée.
- Deux sous-domaines distincts (`hr.` pour le frontend, `api.hr.` pour le backend), cohérent
  avec les deux `host:` définis dans `infra/k8s/base/ingress.yaml`.

## 8.4 Mettre à jour les manifestes (fait)

Remplacement de `example.com` par `human-edge.dev` à 3 endroits :

- `infra/k8s/base/ingress.yaml` : les 2 `host:` (`hr.example.com` → `hr.human-edge.dev`,
  `api.hr.example.com` → `api.hr.human-edge.dev`) et la section `tls.hosts`.
- `infra/k8s/overlays/prod/patch-configmap.yaml` : `CORS_ALLOWED_ORIGINS` →
  `https://hr.human-edge.dev`.
- `infra/k8s/overlays/dev/patch-configmap.yaml` : `CORS_ALLOWED_ORIGINS` →
  `https://dev.hr.human-edge.dev` (sous-domaine `dev.` distinct - pas d'enregistrement DNS
  créé pour celui-ci pour l'instant, à ajouter uniquement si l'overlay dev est réellement
  utilisé sur ce domaine).

Ces fichiers doivent être commités et poussés pour qu'Argo CD les synchronise
(`selfHeal: true` - resync automatique après le push, ou forcer avec `kubectl -n argocd
annotate application hr-app argocd.argoproj.io/refresh=hard --overwrite`).

## 8.5 Vérifications

```bash
nslookup hr.human-edge.dev
kubectl -n hr get certificate
kubectl -n hr describe certificate hr-tls
curl -I https://hr.human-edge.dev
```

- `nslookup` : confirme que le DNS public résout bien vers `34.62.103.210` (peut prendre
  quelques minutes après la création des enregistrements, malgré le TTL court).
- `get certificate` : `READY=True` signifie que cert-manager a obtenu un vrai certificat
  Let's Encrypt (remplace le certificat auto-signé utilisé pendant la phase fichier `hosts`).
  Si `READY=False` après quelques minutes, `describe` affiche l'étape bloquante (le plus
  souvent : DNS pas encore propagé, le challenge HTTP-01 ne peut pas joindre le domaine).
- `curl -I https://...` : doit répondre `HTTP/2 200` (ou redirection front) sans avertissement
  de certificat.

Une fois validé, retire les entrées `hr.example.com`/`api.hr.example.com` du fichier `hosts`
local (`C:\Windows\System32\drivers\etc\hosts`) - elles ne servent plus, le vrai DNS prend le
relais pour tout le monde, pas seulement ta machine.
