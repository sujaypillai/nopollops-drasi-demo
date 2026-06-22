export const config = {
  port: Number(process.env.PORT ?? "8080"),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://nopollops:nopollops@localhost:5432/nopollops",
  operatorKey: process.env.OPERATOR_KEY ?? "change-me-for-demo",
  demoNamespace: process.env.DEMO_NAMESPACE ?? "nopollops-demo",
  maxRealDeployments: Number(process.env.MAX_REAL_DEPLOYMENTS ?? "30"),
  kubernetesEnabled: process.env.KUBERNETES_ENABLED !== "false"
};

