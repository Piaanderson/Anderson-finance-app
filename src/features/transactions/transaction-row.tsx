import { signedUsd } from "@/lib/money";
import { TransferDetails } from "./transfer-details";

type TransactionRowProps = {
  name: string;
  account: string;
  category: string;
  date: string;
  amount: number;
  pending?: boolean;
  transferLegs?: Array<{ account: string; amount: number; date: string }>;
};

export function TransactionRow({
  name,
  account,
  category,
  date,
  amount,
  pending,
  transferLegs
}: TransactionRowProps) {
  return (
    <article className="transaction-row">
      <div>
        <strong>{name}</strong>
        <div className="muted">
          {account} · {date}
          {pending ? " · Pending" : ""}
        </div>
        {transferLegs ? <TransferDetails legs={transferLegs} /> : null}
      </div>
      <span className="muted">{category}</span>
      <strong className="row-amount">{signedUsd(amount)}</strong>
    </article>
  );
}
