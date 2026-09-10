"use client";
// Adapted from shadcn/ui preview-02 NotificationSettings and EmptyConnectBank
// (MIT). Unique IDs and demo-only state keep side-by-side previews independent.
import { useId, useState } from "react";
import { DesignIcon } from "./icons";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { FieldDescription, FieldLabel } from "../ui/field";

const NOTIFICATIONS = [
  {
    id: "transactions",
    label: "Transaction alerts",
    description: "Deposits, withdrawals, and transfers.",
    defaultChecked: true,
  },
  {
    id: "security",
    label: "Security alerts",
    description: "Login attempts and account changes.",
    defaultChecked: true,
  },
  {
    id: "goals",
    label: "Goal milestones",
    description: "Updates at 25%, 50%, 75%, and 100%.",
    defaultChecked: false,
  },
  {
    id: "market",
    label: "Market updates",
    description: "Daily portfolio summary and price alerts.",
    defaultChecked: false,
  },
];

export function NotificationSettings() {
  const id = useId();
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATIONS.map((n) => [n.id, n.defaultChecked])),
  );
  const [saved, setSaved] = useState(false);
  const allChecked = NOTIFICATIONS.every((n) => checked[n.id]);
  const someChecked = NOTIFICATIONS.some((n) => checked[n.id]) && !allChecked;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose what you want to be notified about.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-3">
          <Checkbox
            id={`${id}-all`}
            checked={allChecked}
            indeterminate={someChecked}
            onCheckedChange={(value) => {
              setChecked(Object.fromEntries(NOTIFICATIONS.map((n) => [n.id, value])));
              setSaved(false);
            }}
          />
          <FieldLabel htmlFor={`${id}-all`}>Select all</FieldLabel>
        </div>
        {NOTIFICATIONS.map((n) => (
          <div key={n.id} className="flex items-start gap-3">
            <Checkbox
              className="mt-0.5"
              id={`${id}-${n.id}`}
              checked={checked[n.id]}
              onCheckedChange={(value) => {
                setChecked((previous) => ({ ...previous, [n.id]: value }));
                setSaved(false);
              }}
            />
            <div className="min-w-0 space-y-1">
              <FieldLabel htmlFor={`${id}-${n.id}`}>{n.label}</FieldLabel>
              <FieldDescription>{n.description}</FieldDescription>
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button type="button" className="w-full" onClick={() => setSaved(true)}>
          {saved ? "Saved in preview" : "Save preferences"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function EmptyConnectBank() {
  const [connected, setConnected] = useState(false);
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="rounded-lg bg-muted p-3">
          <DesignIcon name="card" />
        </div>
        <div className="space-y-1.5">
          <CardTitle>{connected ? "Preview connected" : "Connect bank"}</CardTitle>
          <CardDescription>
            Link your payout method to receive monthly royalty distributions automatically.
          </CardDescription>
        </div>
        <Button type="button" variant="outline" onClick={() => setConnected(!connected)}>
          {connected ? "Reset preview" : "Set up payouts"}
        </Button>
      </CardContent>
    </Card>
  );
}
