# cluster-wide/
# Resources in this folder are CLUSTER-SCOPED (not namespace-scoped).
# ArgoCD watches k8s/ only (namespace-scoped resources).
# Apply files here manually ONE TIME:
#
#   kubectl apply -f cluster-wide/cert-manager-issuer.yaml
#
# These never need to be re-applied unless you change the config.
# cert-manager auto-renews certs every 90 days without any action from you.
