"use client";

// Adapted from shadcn/ui preview-02 cards (MIT). All values are sample content.
import { useId, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { Button } from "../ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/card";
import { Field, FieldLabel, FieldDescription } from "../ui/field";
import { Textarea } from "../ui/textarea";
import { Slider } from "../ui/slider";
import { Progress } from "../ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { NotificationSettings, EmptyConnectBank } from "./templates";
import { DesignIcon, type DesignIconName } from "./icons";
import { useGallery } from "./gallery-context";

function ContributionHistory() {
  const [detail, setDetail] = useState(false);
  const months = ["Dec", "Jan", "Feb", "Mar", "Apr", "May"];
  const amounts = [800, 1100, 900, 1300, 750, 1400];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contribution history</CardTitle>
        <CardDescription>Contributions from December to May</CardDescription>
      </CardHeader>
      <CardContent>
        <figure
          className="contribution-chart"
          aria-label="Monthly contributions, December through May"
        >
          {months.map((month, index) => (
            <div key={month} className="contribution-column">
              <div className="contribution-bar-space">
                <div
                  className="contribution-bar"
                  style={{
                    height: `${amounts[index] / 14}%`,
                    background: "var(--chart-2)",
                  }}
                  title={`${month}: $${amounts[index]}`}
                />
              </div>
              <figcaption>
                {month}
                <span className="sr-only">: ${amounts[index]}</span>
              </figcaption>
            </div>
          ))}
        </figure>
      </CardContent>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="gallery-inset">
            <span className="gallery-small-label">Upcoming</span>
            <strong className="gallery-heading">May 25, 2024</strong>
            <span className="text-muted-foreground">$1,000 scheduled</span>
          </div>
          <div className="gallery-inset">
            <span className="gallery-small-label">Auto-save plan</span>
            <strong className="gallery-heading">Accelerated</strong>
            <span className="text-muted-foreground">Every week</span>
          </div>
        </div>
        {detail && (
          <output className="mt-4 block text-sm">$6,250 contributed across six months.</output>
        )}
      </CardContent>
      <CardFooter>
        <Button type="button" className="w-full" onClick={() => setDetail(!detail)}>
          {detail ? "Hide total" : "Show total"}
        </Button>
      </CardFooter>
    </Card>
  );
}

const currencies = [
  { value: "usd", label: "USD · US dollar" },
  { value: "eur", label: "EUR · Euro" },
  { value: "gbp", label: "GBP · British pound" },
  { value: "jpy", label: "JPY · Japanese yen" },
];

function PayoutThreshold() {
  const id = useId();
  const gallery = useGallery();
  const [saved, setSaved] = useState(false);

  const form = useForm({
    defaultValues: { amount: 2500, currency: "usd", notes: "" },
    onSubmit: () => setSaved(true),
  });

  return (
    <Card>
      <CardHeader className="relative pe-14">
        <CardTitle>Payout threshold</CardTitle>
        <CardDescription>Choose the minimum balance for a payout.</CardDescription>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute end-5 top-0 bg-muted"
          aria-label="Reset payout preview"
          onClick={() => {
            form.reset();
            setSaved(false);
          }}
        >
          <DesignIcon name="close" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-7">
        <form.Field name="currency">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`${id}-currency`}>Currency</FieldLabel>
              <Select
                items={currencies}
                value={field.state.value}
                onValueChange={(value) => {
                  if (value) field.handleChange(value);
                  setSaved(false);
                }}
              >
                <SelectTrigger id={`${id}-currency`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  data-design-preview={gallery.mode}
                  data-style={gallery.settings.style}
                  data-pointer={gallery.settings.pointer}
                  className="gallery-menu"
                  style={gallery.style}
                  dir={gallery.settings.rtl ? "rtl" : "ltr"}
                >
                  {currencies.map((currency) => (
                    <SelectItem key={currency.value} value={currency.value}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>
        <form.Field name="amount">
          {(field) => (
            <Field>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <FieldLabel htmlFor={`${id}-amount`}>Minimum payout</FieldLabel>
                <form.Subscribe selector={(state) => state.values.currency}>
                  {(currency) => (
                    <span className="text-2xl font-semibold tabular-nums">
                      {field.state.value.toLocaleString("en-US", {
                        style: "currency",
                        currency: currency.toUpperCase(),
                      })}
                    </span>
                  )}
                </form.Subscribe>
              </div>
              <Slider
                id={`${id}-amount`}
                aria-label="Minimum payout amount"
                getAriaLabel={() => "Minimum payout amount"}
                value={field.state.value}
                min={50}
                max={10000}
                step={50}
                onValueChange={(value) => {
                  // oxlint-disable-next-line typescript/no-unsafe-assignment -- The slider component's union is typed as any by its current declaration.
                  const nextValue: unknown = Array.isArray(value) ? value[0] : value;

                  if (Schema.is(Schema.Finite)(nextValue)) field.handleChange(nextValue);
                  setSaved(false);
                }}
              />
              <div className="flex justify-between">
                <FieldDescription>Minimum: 50</FieldDescription>
                <FieldDescription>Maximum: 10,000</FieldDescription>
              </div>
            </Field>
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
              <Textarea
                id={`${id}-notes`}
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  setSaved(false);
                }}
                placeholder="Hold payouts until the invoice is paid"
                rows={4}
              />
            </Field>
          )}
        </form.Field>
      </CardContent>
      <CardFooter>
        <Button type="button" className="w-full" onClick={() => void form.handleSubmit()}>
          {saved ? "Saved in preview" : "Save threshold"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function SavingsTargets() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Savings targets</CardTitle>
        <CardDescription>Active milestones for 2024</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {[
          { name: "Retirement", amount: "$420,000", percent: 65 },
          { name: "Real estate", amount: "$85,000", percent: 32 },
        ].map((goal) => (
          <div key={goal.name} className="gallery-inset gap-3">
            <span className="gallery-small-label">{goal.name}</span>
            <strong className="text-3xl tabular-nums">{goal.amount}</strong>
            <Progress aria-label={`${goal.name} progress`} value={goal.percent} />
            <span className="text-muted-foreground">{goal.percent}% achieved</span>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <CardDescription>Keep contributing to reach your targets.</CardDescription>
      </CardFooter>
    </Card>
  );
}

function DistributeTrack() {
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-5 text-center">
        <div className="gallery-icon-tile">
          <DesignIcon name="plus" className="size-6" />
        </div>
        <CardTitle>Distribute a track</CardTitle>
        <CardDescription>
          Upload a track to release it on Spotify, Apple Music, and other music services.
        </CardDescription>
        <Button type="button" variant="outline" onClick={() => setCreating(!creating)}>
          {creating ? "Reset preview" : "Create release"}
        </Button>
        {creating && (
          <output className="text-muted-foreground">Sample release created in this preview.</output>
        )}
      </CardContent>
    </Card>
  );
}

function ClaimableBalance() {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Available balance</CardDescription>
        <div className="gallery-heading text-5xl font-semibold tabular-nums">$0.00</div>
        <span className="mt-1 w-fit rounded-full border px-2 py-0.5 text-xs">Setup needed</span>
      </CardHeader>
      <CardContent>
        <div className="gallery-inset gap-4">
          {["Net royalties", "Processing fee", "Total ready to claim"].map((label) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums">$0.00</span>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <CardDescription>Connect a bank to receive monthly royalty payments.</CardDescription>
      </CardFooter>
    </Card>
  );
}

const transactions: { name: string; category: string; amount: string; icon: DesignIconName }[] = [
  { name: "Blue Bottle Coffee", category: "Food and drink", amount: "−$6.50", icon: "coffee" },
  { name: "Whole Foods Market", category: "Groceries", amount: "−$142.30", icon: "cart" },
  { name: "Uber Technologies", category: "Transport", amount: "−$24.10", icon: "car" },
  { name: "Netflix subscription", category: "Entertainment", amount: "−$19.99", icon: "tv" },
];

function RecentTransactions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent transactions</CardTitle>
        <CardDescription>Your latest account activity.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {transactions.map((item) => (
            <li key={item.name} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
              <div className="gallery-icon-tile">
                <DesignIcon name={item.icon} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-muted-foreground">{item.category}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums">{item.amount}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function MenuPreview() {
  const [selected, setSelected] = useState("Overview");

  const items: { label: string; icon: DesignIconName }[] = [
    { label: "Overview", icon: "home" },
    { label: "Transactions", icon: "wallet" },
    { label: "Payment methods", icon: "card" },
    { label: "Settings", icon: "settings" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace menu</CardTitle>
        <CardDescription>Menu color and selection accent</CardDescription>
      </CardHeader>
      <CardContent>
        <nav aria-label="Example workspace menu" className="gallery-menu gallery-menu-sample">
          {items.map((item) => (
            <Button
              key={item.label}
              type="button"
              variant="ghost"
              aria-current={selected === item.label ? "page" : undefined}
              onClick={() => setSelected(item.label)}
              className="w-full justify-start gap-3"
            >
              <DesignIcon name={item.icon} />
              {item.label}
            </Button>
          ))}
        </nav>
      </CardContent>
    </Card>
  );
}

export function ComponentGallery() {
  return (
    <div className="component-gallery">
      <div className="gallery-column">
        <ContributionHistory />
        <DistributeTrack />
        <NotificationSettings />
      </div>
      <div className="gallery-column">
        <PayoutThreshold />
        <ClaimableBalance />
        <MenuPreview />
      </div>
      <div className="gallery-column">
        <SavingsTargets />
        <RecentTransactions />
        <EmptyConnectBank />
      </div>
    </div>
  );
}
