import * as k8s from "@kubernetes/client-node";
import { config } from "./config.js";

const kc = new k8s.KubeConfig();

try {
  kc.loadFromDefault();
} catch {
  // The API can run in simulated mode for local development.
}

const appsApi = kc.makeApiClient(k8s.AppsV1Api);

export function deploymentName(appName: string) {
  return appName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function createDemoDeployment(input: { appName: string; image: string; teamName: string }) {
  if (!config.kubernetesEnabled || !kc.getCurrentCluster()) {
    return { mode: "simulated" as const, name: deploymentName(input.appName) };
  }

  const name = deploymentName(input.appName);
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
          "nopollops.dev/team": input.teamName
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            "app.kubernetes.io/name": name
          }
        },
        template: {
          metadata: {
            labels: {
              "app.kubernetes.io/name": name,
              "app.kubernetes.io/part-of": "nopollops",
              "nopollops.dev/team": input.teamName
            }
          },
          spec: {
            containers: [
              {
                name: "app",
                image: input.image,
                imagePullPolicy: "IfNotPresent",
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

  return { mode: "kubernetes" as const, name };
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
        value: input.image
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
