import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fileUpload from "express-fileupload";

import adminRoutes from "@/routes/admin.routes";
import adminStakingRoutes from "@/routes/admin.staking.routes"; // ✅ NEW
import agentRoutes from "@/routes/agent.routes";
import depositRoutes from "@/routes/deposit.routes";
import kycRoutes from "@/routes/kyc.routes";
import notificationRoutes from "@/routes/notification.routes";
import pushRoutes from "@/routes/push.route";
import rankRoutes from "@/routes/rank.routes";
import stakingRoutes from "@/routes/staking.routes"; // ✅ NEW
import userRoutes from "@/routes/user.routes";
import wheelRoutes from "@/routes/wheel.routes";
import withdrawRoutes from "@/routes/withdraw.routes";
import { errorHandler } from "./middlewares/errorHandler";
import accountRoutes from "./routes/account.routes";
import adminUsersRoutes from "./routes/admin.users.routes";
import aiAccountRoutes from "./routes/aiAccount.routes";
import binanceTradeRoutes from "./routes/binanceTrade.routes";
import cryptoRoutes from "./routes/crypto.routes";
import healthRoutes from "./routes/health.routes";
import tradeRoutes from "./routes/trade.routes";
import tradingPPairRoutes from "./routes/tradingPair.routes";
import transactionRoutes from "./routes/transactions.routes";
import transferRoutes from "./routes/transfer.routes";
import lotteryRoutes from "./routes/lottery.routes";
import lonanRoutes from "./routes/loan.routes";
import rankRoutesnew from "@/routes/rank.routes.new";
import walletRoutes from "./routes/wallet.routes";
import depositWalletRoutes from "./routes/deposit-wallet.routes";
// Config
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "src/config/config.env" });
}

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "https://www.upbittrade.com",
  "https://upbitadmin.vercel.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());

// Routes
app.use("/api/v1", userRoutes);
app.use("/api/v1", adminRoutes);
app.use("/api/v1", adminStakingRoutes); // ✅ NEW
app.use("/api/v1", stakingRoutes); // ✅ NEW
app.use(`/api/v1/loans`,           lonanRoutes);
app.use(`/api/v1/lottery`,         lotteryRoutes);
app.use(`/api/v1/ranks`,            rankRoutesnew);
app.use(`/api/v1/wallets`,         walletRoutes);
app.use(`/api/v1/deposit-wallets`, depositWalletRoutes);
app.use("/api/v1", depositRoutes);
app.use("/api/v1", rankRoutes);
app.use("/api/v1", notificationRoutes);
app.use("/api/v1", withdrawRoutes);
app.use("/api/v1", wheelRoutes);
app.use("/api/v1", agentRoutes);
app.use("/api/v1", accountRoutes);
app.use("/api/v1", cryptoRoutes);
app.use("/api/v1", tradeRoutes);
app.use("/api/v1", transferRoutes);
app.use("/api/v1", aiAccountRoutes);
app.use("/api/v1", transactionRoutes);
app.use("/api/v1", pushRoutes);
app.use("/api/v1", adminUsersRoutes);
app.use("/api/v1", binanceTradeRoutes);
app.use("/api/v1", tradingPPairRoutes);

app.use("/api", cryptoRoutes);

app.use("/api/v1", kycRoutes);

app.use("/api/v1", healthRoutes);

// Test Route
app.get("/", (req, res) => {
  const data = {
    server_time: new Date().toString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    server_mode: process.env.NODE_ENV,
    server_port: process.env.PORT,
    root_url: req.protocol + "://" + req.get("host"),
  };
  res.status(200).json({ success: true, data });
});

app.use(errorHandler);

export default app;
