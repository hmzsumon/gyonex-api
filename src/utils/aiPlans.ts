/* ──────────────────────────────────────────────────────────────────────────
   AI Plan Seed Data
────────────────────────────────────────────────────────────────────────── */
export const AI_PLAN_SEEDS = [
  {
    key: "classic",
    title: "Classic",
    subtitle: "Smaller lots, lower risk. Great for practicing.",
    amount: 30,
    rows: [
      { label: "Min deposit", value: "30 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
  {
    key: "standard",
    title: "Standard",
    subtitle: "Balanced spreads with fast execution.",
    amount: 50,
    rows: [
      { label: "Min deposit", value: "50 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
  {
    key: "advanced",
    title: "Advanced",
    subtitle: "Lower spreads for active day traders.",
    amount: 100,
    rows: [
      { label: "Min deposit", value: "100 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
  {
    key: "professional",
    title: "Professional",
    subtitle: "Priority routing & premium support.",
    amount: 300,
    rows: [
      { label: "Min deposit", value: "300 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
  {
    key: "premium",
    title: "Premium",
    subtitle: "Ultra-tight spreads for scalping.",
    amount: 500,
    rows: [
      { label: "Min deposit", value: "500 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
  {
    key: "elite",
    title: "Elite",
    subtitle: "Deep liquidity with VIP features.",
    amount: 1000,
    rows: [
      { label: "Min deposit", value: "1000 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
  {
    key: "royal",
    title: "Royal",
    subtitle: "Institutional grade execution & tools.",
    amount: 2000,
    rows: [
      { label: "Min deposit", value: "2000 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
  {
    key: "platinum",
    title: "Platinum",
    subtitle: "Exclusive benefits for high rollers.",
    amount: 5000,
    rows: [
      { label: "Min deposit", value: "5000 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
  {
    key: "diamond",
    title: "Diamond",
    subtitle: "Top-tier service for elite traders.",
    amount: 10000,
    rows: [
      { label: "Min deposit", value: "10000 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
  {
    key: "supreme",
    title: "Supreme",
    subtitle: "The ultimate trading experience.",
    amount: 50000,
    rows: [
      { label: "Min deposit", value: "50000 USD" },
      { label: "Profit target", value: "1% - 12% per day" },
      { label: "Max leverage", value: "1:Unlimited" },
    ],
  },
].map((item, index) => ({
  ...item,
  sortOrder: index + 1,
  isActive: true,
}));
