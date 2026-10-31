
import express from "express";
import cookieParser from "cookie-parser";

import authRoutes from "./modules/auth/authroutes.js";
import { errorHandler } from "./middleware/errorhandler.js";
import organizationRoutes from "./modules/organization/organizationroutes.js";
import { accountsRouter } from "./modules/accounts/accountroutes.js";
import ledgerRoutes from "./modules/ledger/ledgerroutes.js";

const app = express();

// Global middleware
app.use(express.json());
app.use(cookieParser());

// Application routes
app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/organizations", accountsRouter);
app.use("/api", ledgerRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "LedgerFlow API",
  });
});

// Error handler must come after routes
app.use(errorHandler);

export default app;
