import * as k8s from "@kubernetes/client-node";
import { config } from "./config.js";

const kc = new k8s.KubeConfig();

try {
  kc.loadFromDefault();
} catch {
  // The API can run in simulated mode for local development.
}

const appsApi = kc.makeApiClient(k8s.AppsV1Api);

export class DemoDeploymentExistsError extends Error {
  statusCode = 409;

  constructor(readonly deploymentName: string) {
    super(`App name is already in use. Choose a different app name, such as ${deploymentName}-${Date.now().toString().slice(-4)}.`);
  }
}

export function deploymentName(appName: string) {
  return appName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function labelValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 63) || "unknown";
}

const imageTranslations: Record<string, string> = {
  "ghcr.io/nopollops/openssl-demo:vulnerable": "nginxinc/nginx-unprivileged:1.20-alpine",
  "ghcr.io/nopollops/openssl-demo:patched":    "nginxinc/nginx-unprivileged:1.27-alpine",
  "ghcr.io/nopollops/payment-api:legacy":      "nginxinc/nginx-unprivileged:1.21-alpine",
  "ghcr.io/nopollops/payment-api:v2":          "nginxinc/nginx-unprivileged:1.27-alpine",
  "ghcr.io/nopollops/payment-api:patched":     "nginxinc/nginx-unprivileged:1.27-alpine",
  "ghcr.io/nopollops/frontend:stable":         "nginxinc/nginx-unprivileged:1.25-alpine",
  "ghcr.io/nopollops/frontend:patched":        "nginxinc/nginx-unprivileged:1.27-alpine"
};

function realImage(image: string) {
  return imageTranslations[image] ?? "nginxinc/nginx-unprivileged:1.27-alpine";
}

export async function createDemoDeployment(input: { appName: string; image: string; teamName: string }) {
  if (!config.kubernetesEnabled || !kc.getCurrentCluster()) {
    return { mode: "simulated" as const, name: deploymentName(input.appName) };
  }

  const name = deploymentName(input.appName);
  const teamLabel = labelValue(input.teamName);
  try {
    await appsApi.createNamespacedDeployment({
      namespace: config.demoNamespace,
      body: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name,
          labels: {
            "app.kubernetes.io/name": name,
            "app.kubernetes.io/part-of": "nopollops",
            "nopollops.dev/team": teamLabel
          },
          annotations: {
            "nopollops.dev/team-name": input.teamName
          }
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              "app.kubernetes.io/name": name,
            }
          },
          template: {
            metadata: {
              labels: {
                "app.kubernetes.io/name": name,
                "app.kubernetes.io/part-of": "nopollops",
                "nopollops.dev/team": teamLabel
              },
              annotations: {
                "nopollops.dev/team-name": input.teamName
              }
            },
            spec: {
              containers: [
                {
                  name: "app",
                  image: realImage(input.image),
                  imagePullPolicy: "IfNotPresent",
                  ports: [{ containerPort: 8080 }],
                  resources: {
                    requests: { cpu: "20m", memory: "32Mi" },
                    limits: { cpu: "100m", memory: "128Mi" }
                  }
                }
              ]
            }
          }
        }
      }
    });
  } catch (error) {
    if (isKubernetesAlreadyExists(error)) {
      throw new DemoDeploymentExistsError(name);
    }
    throw error;
  }

  return { mode: "kubernetes" as const, name };
}

function isKubernetesAlreadyExists(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code === 409) return true;
  const body = record.body;
  if (!body || typeof body !== "object") return false;
  const bodyRecord = body as Record<string, unknown>;
  return bodyRecord.reason === "AlreadyExists" || bodyRecord.code === 409;
}

export async function patchDemoDeploymentImage(input: { deploymentName: string; image: string }) {
  if (!config.kubernetesEnabled || !kc.getCurrentCluster()) {
    return { mode: "simulated" as const };
  }

  await appsApi.patchNamespacedDeployment({
    name: input.deploymentName,
    namespace: config.demoNamespace,
    body: [
      {
        op: "replace",
        path: "/spec/template/spec/containers/0/image",
        value: realImage(input.image)
      }
    ]
  });

  return { mode: "kubernetes" as const };
}

export async function deleteDemoDeployment(input: { deploymentName: string }) {
  if (!config.kubernetesEnabled || !kc.getCurrentCluster()) {
    return { mode: "simulated" as const };
  }

  await appsApi.deleteNamespacedDeployment({
    name: input.deploymentName,
    namespace: config.demoNamespace
  });

  return { mode: "kubernetes" as const };
}
