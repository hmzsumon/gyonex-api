import { syncTeamActivations } from "@/controllers/maintenance.controller";
import { Router } from "express";

const router = Router();
router.post("/sync-team-activations", syncTeamActivations);

export default router;
