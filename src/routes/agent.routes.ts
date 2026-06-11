import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

/* ────────── Get All Agents ────────── */
import {
  agentLogin,
  createAgentStatusForAllAgents,
  getAllAgents,
  getAllDepositsForAgent,
  getAllUsersByAgentId,
  getAllWithdrawForAgent,
  getMyAgentStatus,
  getUserByAgentIdAndUserId,
} from "@/controllers/agent.controller";

/* ────────── agent login ────────── */
router.post("/agent-login", agentLogin);

router.get("/agents", isAuthenticatedUser, getAllAgents);
/* ────────── Create AgentStatus for all agent ────────── */
router.post(
  "/agents/create-status",
  isAuthenticatedUser,
  createAgentStatusForAllAgents
);

/* ────────── Get My Agent Status ────────── */
router.get("/my-agent-status", isAuthenticatedUser, getMyAgentStatus);

/* ────────── Get All Users By Agent Id ────────── */
router.get(
  "/get-all-users-by-agent-id",
  isAuthenticatedUser,
  getAllUsersByAgentId
);

/* ────────── Get User By Agent Id And User Id ────────── */
router.get(
  "/get-user-by-agent-id-and-user-id/:id",
  isAuthenticatedUser,
  getUserByAgentIdAndUserId
);

/* ────────── Get All Deposits For Agent ────────── */
router.get(
  "/get-all-deposits-for-agent",
  isAuthenticatedUser,
  getAllDepositsForAgent
);

/* ────────── Get All Withdraw For Agent ────────── */
router.get(
  "/get-all-withdraw-for-agent",
  isAuthenticatedUser,
  getAllWithdrawForAgent
);

export default router;
