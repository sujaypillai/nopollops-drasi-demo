import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

type Participant = {
  id: string;
  displayName: string;
  teamName: string;
};

type DashboardState = {
  participants: number;
  submissions: Array<{ appName: string; teamName: string; image: string; status: string; createdAt: string }>;
  riskyWorkloads: Array<{ appName: string; teamName: string; image: string; severity: string; reason: string; mitigation: string }>;
  affectedTeams: Array<{ teamName: string; riskyWorkloadCount: number; highestSeverity: string }>;
  activeRisks: Array<{ image: string; severity: string; reason: string; mitigation: string }>;
  votes: Record<string, number>;
  reactions: Array<{ id: string; changeType: string; queryName: string; summary: string; createdAt: string }>;
};

const imageOptions = [
  "ghcr.io/nopollops/frontend:stable",
  "ghcr.io/nopollops/payment-api:legacy",
  "ghcr.io/nopollops/cart-service:latest",
  "ghcr.io/nopollops/inventory-api:v2",
  "ghcr.io/nopollops/openssl-demo:vulnerable"
];

const remediationOptions = ["Upgrade image", "Quarantine namespace", "Alert owner"];

const emptyDashboard: DashboardState = {
  participants: 0,
  submissions: [],
  riskyWorkloads: [],
  affectedTeams: [],
  activeRisks: [],
  votes: {},
  reactions: []
};

export function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [participant, setParticipant] = useState<Participant | null>(() => {
    const raw = localStorage.getItem("nopollops.participant");
    return raw ? JSON.parse(raw) : null;
  });
  const [dashboard, setDashboard] = useState<DashboardState>(emptyDashboard);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then(setDashboard)
      .catch(() => undefined);

    const events = new EventSource("/events");
    events.addEventListener("dashboard", (event) => {
      setDashboard(JSON.parse((event as MessageEvent).data));
    });
    return () => events.close();
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setRoute(path);
  };

  const page = useMemo(() => {
    if (route.startsWith("/dashboard")) return "dashboard";
    if (route.startsWith("/operator")) return "operator";
    if (route.startsWith("/vote")) return "vote";
    if (route.startsWith("/deploy")) return "deploy";
    return "join";
  }, [route]);

  return (
    <main className="shell">
      <nav className="topbar">
        <button className="brand" onClick={() => navigate("/")}>
          <span className="pulse" />
          NoPollOps
        </button>
        <div className="navlinks">
          <button onClick={() => navigate("/")}>Join</button>
          <button onClick={() => navigate("/deploy")}>Deploy</button>
          <button onClick={() => navigate("/vote")}>Vote</button>
          <button onClick={() => navigate("/dashboard")}>Dashboard</button>
          <button onClick={() => navigate("/operator")}>Operator</button>
        </div>
      </nav>

      {page === "join" && <JoinPage participant={participant} setParticipant={setParticipant} navigate={navigate} />}
      {page === "deploy" && <DeployPage participant={participant} navigate={navigate} />}
      {page === "vote" && <VotePage participant={participant} />}
      {page === "dashboard" && <DashboardPage state={dashboard} />}
      {page === "operator" && <OperatorPage />}
    </main>
  );
}

function JoinPage({
  participant,
  setParticipant,
  navigate
}: {
  participant: Participant | null;
  setParticipant: (participant: Participant) => void;
  navigate: (path: string) => void;
}) {
  const [displayName, setDisplayName] = useState("");

  async function join(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName })
    });
    const created = await response.json();
    localStorage.setItem("nopollops.participant", JSON.stringify(created));
    setParticipant(created);
    navigate("/deploy");
  }

  return (
    <section className="hero grid-two">
      <div>
        <p className="eyebrow">KCD Kuala Lumpur live demo</p>
        <h1>Stop polling. Start declaring the change that matters.</h1>
        <p className="lede">
          Join the incident room, deploy a demo workload, and watch Drasi detect risky cloud-native state as it changes.
        </p>
        {participant ? (
          <div className="glass-card">
            <p>You are checked in as</p>
            <h2>{participant.displayName}</h2>
            <p className="team">{participant.teamName}</p>
            <button className="primary" onClick={() => navigate("/deploy")}>Deploy an app</button>
          </div>
        ) : (
          <form className="glass-card form" onSubmit={join}>
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. Sujay"
              maxLength={40}
            />
            <button className="primary" type="submit" disabled={!displayName.trim()}>Join demo</button>
          </form>
        )}
      </div>
      <div className="poster">
        <div className="qr">QR</div>
        <p>Audience source of change</p>
        <span>PostgreSQL + Kubernetes → Drasi → Live reactions</span>
      </div>
    </section>
  );
}

function DeployPage({ participant, navigate }: { participant: Participant | null; navigate: (path: string) => void }) {
  const [appName, setAppName] = useState("");
  const [image, setImage] = useState(imageOptions[0]);
  const [status, setStatus] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!participant) {
      navigate("/");
      return;
    }
    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participant.id, appName, image })
    });
    const result = await response.json();
    setStatus(`${result.appName} submitted as ${result.status}`);
  }

  return (
    <section className="panel">
      <p className="eyebrow">Audience action</p>
      <h1>Deploy a cloud-native app</h1>
      <form className="form wide" onSubmit={submit}>
        <label htmlFor="appName">App name</label>
        <input id="appName" value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="team-satay-api" />
        <label htmlFor="image">Container image</label>
        <select id="image" value={image} onChange={(event) => setImage(event.target.value)}>
          {imageOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <button className="primary" disabled={!appName.trim()}>Submit deployment</button>
      </form>
      {status && <p className="success">{status}</p>}
    </section>
  );
}

function VotePage({ participant }: { participant: Participant | null }) {
  const [selected, setSelected] = useState(remediationOptions[0]);
  const [status, setStatus] = useState<string | null>(null);

  async function vote() {
    if (!participant) return;
    await fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participant.id, incidentKey: "active-risk", vote: selected })
    });
    setStatus(`Vote recorded: ${selected}`);
  }

  return (
    <section className="panel">
      <p className="eyebrow">Human in the loop</p>
      <h1>Choose the remediation</h1>
      <div className="vote-grid">
        {remediationOptions.map((option) => (
          <button className={selected === option ? "vote selected" : "vote"} key={option} onClick={() => setSelected(option)}>
            {option}
          </button>
        ))}
      </div>
      <button className="primary" onClick={vote} disabled={!participant}>Submit vote</button>
      {status && <p className="success">{status}</p>}
    </section>
  );
}

function DashboardPage({ state }: { state: DashboardState }) {
  const totalVotes = Object.values(state.votes).reduce((sum, count) => sum + count, 0);

  return (
    <section className="dashboard">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">Presenter dashboard</p>
          <h1>Continuous Query Control Room</h1>
        </div>
        <div className="metrics">
          <Metric label="Participants" value={state.participants} />
          <Metric label="Apps" value={state.submissions.length} />
          <Metric label="Risky" value={state.riskyWorkloads.length} />
          <Metric label="Votes" value={totalVotes} />
        </div>
      </header>
      <div className="query-strip">
        <span>Continuous query:</span>
        <code>MATCH running pods + app submissions + active risky images RETURN affected workloads</code>
      </div>
      <div className="dashboard-grid">
        <Board title="Risky workloads">
          {state.riskyWorkloads.length === 0 && <EmptyState text="No risky workloads detected. Create change to wake up the room." />}
          {state.riskyWorkloads.map((item) => (
            <article className="incident" key={`${item.appName}-${item.image}`}>
              <strong>{item.appName}</strong>
              <span>{item.teamName}</span>
              <code>{item.image}</code>
              <em>{item.severity}</em>
              <small>{item.mitigation}</small>
            </article>
          ))}
        </Board>
        <Board title="Audience deployments">
          {state.submissions.length === 0 && <EmptyState text="Waiting for audience deployments." />}
          {state.submissions.slice(0, 8).map((item) => (
            <article className="row" key={`${item.teamName}-${item.appName}`}>
              <span>{item.appName}</span>
              <small>{item.teamName}</small>
              <code>{item.image}</code>
            </article>
          ))}
        </Board>
        <Board title="Affected teams">
          {state.affectedTeams.length === 0 && <EmptyState text="No team blast radius yet." />}
          {state.affectedTeams.map((team) => (
            <article className="team-card" key={team.teamName}>
              <strong>{team.teamName}</strong>
              <span>{team.riskyWorkloadCount} risky workload(s)</span>
              <em>{team.highestSeverity}</em>
            </article>
          ))}
        </Board>
        <Board title="Remediation vote">
          {Object.keys(state.votes).length === 0 && <EmptyState text="Audience votes appear here." />}
          {Object.entries(state.votes).map(([vote, count]) => (
            <div className="bar" key={vote}>
              <span>{vote}</span>
              <div><i style={{ width: `${Math.min(100, count * 12)}%` }} /></div>
              <b>{count}</b>
            </div>
          ))}
        </Board>
        <Board title="Drasi reaction feed">
          {state.reactions.length === 0 && <EmptyState text="Reaction events from Drasi or the operator appear here." />}
          {state.reactions.slice(0, 8).map((event) => (
            <article className="reaction" key={event.id}>
              <span>{event.changeType}</span>
              <strong>{event.queryName}</strong>
              <p>{event.summary}</p>
            </article>
          ))}
        </Board>
        <Board title="Active risk catalog">
          {state.activeRisks.length === 0 && <EmptyState text="No active risky images." />}
          {state.activeRisks.map((risk) => (
            <article className="row" key={risk.image}>
              <span>{risk.severity}</span>
              <code>{risk.image}</code>
              <small>{risk.reason}</small>
            </article>
          ))}
        </Board>
      </div>
    </section>
  );
}

function OperatorPage() {
  const [operatorKey, setOperatorKey] = useState("");
  const [image, setImage] = useState("ghcr.io/nopollops/payment-api:legacy");
  const [replacementImage, setReplacementImage] = useState("ghcr.io/nopollops/payment-api:v2");
  const [message, setMessage] = useState<string | null>(null);

  async function operatorPost(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-operator-key": operatorKey },
      body: JSON.stringify(body)
    });
    return response;
  }

  async function markRisky() {
    const response = await operatorPost("/api/operator/risky-images", {
      image,
      severity: "High",
      reason: "Conference demo CVE signal",
      mitigation: "Upgrade to a patched image tag"
    });
    setMessage(response.ok ? "Risk signal published" : "Operator request failed");
  }

  async function resolveRisk() {
    const response = await fetch("/api/operator/risky-images/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-operator-key": operatorKey },
      body: JSON.stringify({ image })
    });
    setMessage(response.ok ? "Risk signal resolved" : "Resolve request failed");
  }

  async function remediate(action: "upgrade" | "quarantine" | "delete") {
    const response = await fetch("/api/operator/remediate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-operator-key": operatorKey },
      body: JSON.stringify({ action, image, replacementImage })
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? `${result.remediated ?? 0} workload(s) remediated` : "Remediation failed");
  }

  async function seed() {
    const response = await fetch("/api/operator/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-operator-key": operatorKey },
      body: JSON.stringify({ count: 18 })
    });
    setMessage(response.ok ? "Seed participants created" : "Seed failed");
  }

  async function resetDemo() {
    const response = await fetch("/api/operator/reset", {
      method: "POST",
      headers: { "x-operator-key": operatorKey }
    });
    setMessage(response.ok ? "Demo reset requested" : "Reset failed");
  }

  return (
    <section className="panel">
      <p className="eyebrow">Operator console</p>
      <h1>Shape the incident live</h1>
      <div className="form wide">
        <label htmlFor="operatorKey">Operator key</label>
        <input id="operatorKey" type="password" value={operatorKey} onChange={(event) => setOperatorKey(event.target.value)} />
        <label htmlFor="riskImage">Risky image</label>
        <input id="riskImage" value={image} onChange={(event) => setImage(event.target.value)} />
        <label htmlFor="replacementImage">Replacement image</label>
        <input id="replacementImage" value={replacementImage} onChange={(event) => setReplacementImage(event.target.value)} />
        <button className="primary" onClick={markRisky}>Mark image risky</button>
        <button className="secondary" onClick={resolveRisk}>Resolve risk signal</button>
        <button className="primary" onClick={() => remediate("upgrade")}>Apply upgrade</button>
        <button className="secondary" onClick={() => remediate("quarantine")}>Quarantine matching apps</button>
        <button className="secondary" onClick={() => remediate("delete")}>Delete matching apps</button>
        <button className="primary" onClick={seed}>Seed backup audience</button>
        <button className="secondary" onClick={resetDemo}>Reset demo</button>
      </div>
      {message && <p className="success">{message}</p>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Board({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="board">
      <h2>{title}</h2>
      <div className="board-body">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}
