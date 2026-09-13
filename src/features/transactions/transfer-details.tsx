import { signedUsd } from "@/lib/money";

type Leg = {
  account: string;
  amount: number;
  date: string;
};

export function TransferDetails({ legs }: { legs: Leg[] }) {
  return (
    <details>
      <summary>View both transfer legs</summary>
      <div className="card">
        {legs.map((leg) => (
          <div className="transaction-row" key={`${leg.account}-${leg.amount}`}>
            <span>{leg.account}</span>
            <span className="muted">{leg.date}</span>
            <strong className="row-amount">{signedUsd(leg.amount)}</strong>
          </div>
        ))}
        <span className="positive">Tied · counted once</span>
      </div>
    </details>
  );
}
