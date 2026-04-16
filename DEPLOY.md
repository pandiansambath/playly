# PlayLy — Azure AKS Deployment Runbook

Deploy PlayLy to Azure Kubernetes Service (AKS).

**Azure Subscription:** `95130b74-535d-4f98-a182-00ecc727b5ca`  
**Region:** `southindia` (Chennai datacenter)  
**Container Registry:** `playlyacr.azurecr.io`  
**GitHub:** https://github.com/pandiansambath/playly

---

## STEP 0 — Install Required Tools

Open PowerShell (as normal user, not admin) and run:

```powershell
# 1. Install Azure CLI
winget install Microsoft.AzureCLI
# OR download from: https://aka.ms/installazurecliwindows
# After install, restart PowerShell

# 2. Install Terraform
winget install Hashicorp.Terraform
# OR: https://developer.hashicorp.com/terraform/downloads
# After install, restart PowerShell

# 3. Install kubectl (via Azure CLI)
az aks install-cli

# 4. Install Helm (for NGINX Ingress)
winget install Helm.Helm

# Verify everything works:
az version
terraform -version
kubectl version --client
helm version
```

---

## STEP 1 — Login to Azure CLI

```powershell
# Login (opens browser for Microsoft login)
az login

# Set your subscription as active
az account set --subscription "95130b74-535d-4f98-a182-00ecc727b5ca"

# Verify you're on the right subscription
az account show
# Should show: "name": "Azure subscription 1"
```

---

## STEP 2 — Terraform: Create All Infrastructure

```powershell
# Go to the terraform folder
cd C:\pandi\praticing_area\supabase\apr15\play-ly-updated\terraform

# Download Azure providers (takes ~1 minute first time)
terraform init

# Preview what will be created — READ THIS before applying!
terraform plan

# Create everything (takes ~10-15 minutes for AKS cluster)
terraform apply
# Type "yes" when it asks for confirmation
```

**What gets created:**
| Resource | What it is |
|---|---|
| `playly-rg` | Resource Group — folder for all PlayLy resources |
| `playlyacr` | Container Registry at `playlyacr.azurecr.io` |
| `playly-aks` | AKS cluster with 2x Standard_B2s nodes |
| `playly-github-actions` | App Registration for GitHub Actions OIDC |

> ⚠️ **If `playlyacr` name is taken:** Edit `terraform/terraform.tfvars`, add the line:
> `acr_name = "playlyregistry"` (or anything globally unique)
> Then run `terraform apply` again.

**After apply, save these output values for GitHub Secrets:**
```powershell
# Run this to see all outputs
terraform output

# You'll see something like:
# acr_login_server          = "playlyacr.azurecr.io"
# github_actions_client_id  = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← save this
# github_actions_tenant_id  = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← save this
# kubectl_config_command    = "az aks get-credentials ..."
```

---

## STEP 3 — Connect kubectl to Your AKS Cluster

```powershell
# Configure kubectl (run the command from terraform output)
az aks get-credentials --resource-group playly-rg --name playly-aks --overwrite-existing

# Verify connection to your cluster
kubectl get nodes
# Expected output (takes 1-2 minutes to be Ready):
# NAME                              STATUS   ROLES   AGE   VERSION
# aks-default-xxxxxxxx-vmss000000   Ready    agent   2m    v1.xx.x
# aks-default-xxxxxxxx-vmss000001   Ready    agent   2m    v1.xx.x
```

---

## STEP 4 — Install NGINX Ingress Controller

This creates a public Load Balancer with an external IP — this IP is your app's address.

```powershell
# Add the NGINX helm chart repository
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install NGINX Ingress (this triggers Azure to create a LoadBalancer)
helm install ingress-nginx ingress-nginx/ingress-nginx `
  --namespace ingress-nginx `
  --create-namespace `
  --set controller.service.type=LoadBalancer

# Wait 2-3 minutes, then get your public IP:
kubectl get svc -n ingress-nginx
# Look for EXTERNAL-IP column — that's your app's public address!
# Save this IP — you'll need it in the next step.

# Keep running this until EXTERNAL-IP shows (not <pending>):
kubectl get svc -n ingress-nginx --watch
# Press Ctrl+C when you see the IP
```

---

## STEP 5 — Create Kubernetes Namespace + Secrets

```powershell
# Create the playly namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets with your real values
# Replace each "YOUR_..." with your actual values below:

kubectl create secret generic playly-secrets `
  --namespace=playly `
  --from-literal=SUPABASE_URL="https://koagwifcrrkojeowevqn.supabase.co" `
  --from-literal=SUPABASE_SERVICE_KEY="YOUR_SUPABASE_SERVICE_KEY" `
  --from-literal=SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY" `
  --from-literal=YOUTUBE_API_KEY="YOUR_YOUTUBE_API_KEY" `
  --from-literal=FRONTEND_URL="http://YOUR_LOADBALANCER_IP"

# Verify
kubectl get secrets -n playly
```

**Where to find each secret:**
| Secret | Where to find it |
|---|---|
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Settings → API → **service_role** key |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → **anon** key |
| `YOUTUBE_API_KEY` | console.cloud.google.com → APIs & Services → Credentials |
| `FRONTEND_URL` | `http://` + the IP from Step 4 (e.g. `http://20.123.45.67`) |

---

## STEP 6 — Update ConfigMap with Your LoadBalancer IP

Edit `k8s/configmap.yaml` — replace `REPLACE_WITH_LB_IP_AFTER_DEPLOY`:

```yaml
FRONTEND_URL: "http://20.123.45.67"   # ← your actual LB IP from Step 4
```

---

## STEP 7 — Bootstrap: Build & Push First Docker Images

> **Why manual first time?** GitHub Actions CI/CD isn't set up yet. We push the initial images manually so there's something to deploy.

```powershell
# Go to project root
cd C:\pandi\praticing_area\supabase\apr15\play-ly-updated

# Login to ACR with Docker
az acr login --name playlyacr

# ── Build & push BACKEND ───────────────────────────────────────────
docker build -t playlyacr.azurecr.io/playly/backend:latest ./backend
docker push playlyacr.azurecr.io/playly/backend:latest

# ── Build & push FRONTEND (with Next.js env vars baked in) ─────────
docker build `
  --build-arg NEXT_PUBLIC_API_URL="/api" `
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://koagwifcrrkojeowevqn.supabase.co" `
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY" `
  -t playlyacr.azurecr.io/playly/frontend:latest `
  ./frontend

docker push playlyacr.azurecr.io/playly/frontend:latest

# Verify images are in ACR:
az acr repository list --name playlyacr
```

---

## STEP 8 — Apply All Kubernetes Manifests

```powershell
# Apply everything
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/services.yaml
kubectl apply -f k8s/ingress.yaml

# Watch pods come up (takes ~1-2 minutes):
kubectl get pods -n playly --watch
# Expected:
# playly-backend-xxxxxxx    1/1   Running   ✅
# playly-frontend-xxxxxxx   1/1   Running   ✅

# Check ingress
kubectl get ingress -n playly
```

---

## STEP 9 — Install ArgoCD (GitOps engine)

ArgoCD runs inside your AKS cluster and auto-deploys whenever your GitHub K8s YAMLs change.

```powershell
# Create ArgoCD namespace and install
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for all ArgoCD pods to be Running (~3-5 minutes)
kubectl get pods -n argocd --watch
# Press Ctrl+C when all show "Running"

# Get the initial admin password:
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | `
  [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($input))
# 💾 SAVE THIS PASSWORD!

# Open ArgoCD UI in browser:
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open: https://localhost:8080
# Username: admin
# Password: <the password from above>
# Accept the SSL warning (self-signed cert)
```

---

## STEP 10 — Connect ArgoCD to GitHub

```powershell
# Apply the ArgoCD Application — tells ArgoCD to watch your k8s/ folder
kubectl apply -f k8s/argocd/application.yaml

# In ArgoCD UI → you'll see "playly" app appear
# Status should show "Synced" + "Healthy" within 3 minutes
# If not, click the "Sync" button manually
```

---

## STEP 11 — Add GitHub Secrets for CI/CD

Go to: **https://github.com/pandiansambath/playly/settings/secrets/actions**

Click "New repository secret" and add each:

| Secret Name | Value |
|---|---|
| `AZURE_CLIENT_ID` | From `terraform output github_actions_client_id` |
| `AZURE_TENANT_ID` | From `terraform output github_actions_tenant_id` |
| `AZURE_SUBSCRIPTION_ID` | `95130b74-535d-4f98-a182-00ecc727b5ca` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://koagwifcrrkojeowevqn.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |

---

## STEP 12 — Test Full CI/CD Pipeline 🚀

Make any tiny change, push to GitHub, watch the magic:

```powershell
# Example: add a comment to backend/main.py
# Then:
git add .
git commit -m "feat: test CI/CD pipeline end-to-end"
git push origin main
```

**What happens automatically:**
1. GitHub Actions `Backend CI/CD` workflow triggers
2. Logs into Azure ACR via OIDC (no passwords!)
3. Builds Docker image → pushes to `playlyacr.azurecr.io`
4. Updates image tag in `k8s/backend-deployment.yaml`
5. Commits the YAML change back to GitHub
6. ArgoCD detects the YAML change → rolling update → new pod live!

Watch it: https://github.com/pandiansambath/playly/actions

---

## STEP 13 — Verify Everything Works

```powershell
# Get your LoadBalancer IP
kubectl get ingress -n playly

# Test backend health
curl http://YOUR_LB_IP/api/health
# Expected: {"status": "ok", "app": "PlayLy"}

# Test backend API docs
# Open browser: http://YOUR_LB_IP/api/docs    ← FastAPI Swagger

# Test frontend
# Open browser: http://YOUR_LB_IP             ← PlayLy app!
```

---

## Cost Estimate (South India, per month)

| Resource | Spec | ~Monthly |
|---|---|---|
| AKS Control Plane | Managed Kubernetes | **FREE** |
| 2x Standard_B2s VMs | 2vCPU / 4GB each | ~$58 |
| Azure Load Balancer | Standard tier | ~$18 |
| ACR Basic | Docker image storage | ~$5 |
| **Total** | | **~$81/month** |

> 💰 Your Azure **$200 free credit** covers **~2.5 months** of full deployment!
> After that — scale down to 1 node (~$47/month) or delete cluster when not needed.

---

## Useful Day-to-Day Commands

```powershell
# View all PlayLy pods
kubectl get pods -n playly

# View backend logs live
kubectl logs -n playly -l app=playly-backend -f

# View frontend logs live
kubectl logs -n playly -l app=playly-frontend -f

# Restart backend pod manually
kubectl rollout restart deployment/playly-backend -n playly

# Check ArgoCD sync status
kubectl get application -n argocd

# Get into a pod for debugging
kubectl exec -it -n playly deployment/playly-backend -- /bin/bash

# Delete everything (when done with testing — saves money)
terraform destroy
```

---

*PlayLy — Built to Learn, Built to Vibe 🎵*  
*Next.js · FastAPI · AKS · ArgoCD · Azure · Supabase*
