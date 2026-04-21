# cluster-wide/
# Resources in this folder are CLUSTER-SCOPED (not namespace-scoped).
# ArgoCD watches k8s/ only (namespace-scoped resources).
# Apply files here manually ONE TIME:
#
#   kubectl apply -f cluster-wide/cert-manager-issuer.yaml
#
# These never need to be re-applied unless you change the config.
# cert-manager auto-renews certs every 90 days without any action from you.
#
# ──────────────────────────────────────────────────────────────────
# FULL TLS BOOTSTRAP (do this once on a fresh cluster):
#
#   1. Install cert-manager (CRDs + controller)
#      kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.5/cert-manager.yaml
#
#   2. Apply the ClusterIssuer (this folder)
#      kubectl apply -f cluster-wide/cert-manager-issuer.yaml
#
#   3. Apply the Certificate (in k8s/ — ArgoCD or kubectl)
#      kubectl apply -f k8s/certificate.yaml
#
#   4. Wait ~60s, then check the cert is "Ready":
#      kubectl -n playly get certificate playly-tls
#      kubectl -n playly describe certificate playly-tls
#
#   5. Once Ready=True, the playly-tls Secret is populated and the
#      ingress (which already references it) starts serving HTTPS.
#      Renewal happens automatically 30 days before expiry.
# ──────────────────────────────────────────────────────────────────
