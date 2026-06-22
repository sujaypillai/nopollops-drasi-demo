import { Response } from "express";

export type DashboardEvent = {
  event: string;
  data: unknown;
};

const clients = new Set<Response>();

export function addClient(response: Response) {
  clients.add(response);
  response.on("close", () => clients.delete(response));
}

export function publish(event: DashboardEvent) {
  const payload = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

