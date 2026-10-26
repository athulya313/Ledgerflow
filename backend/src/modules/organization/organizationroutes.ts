import { Router } from "express";
import { getOrganization } from "./organizationcontroller.js";
import { requireAuth } from "../auth/authmiddleware.js";
import { requireOrganization } from "../../middleware/requireorganization.js";

const router = Router();

router.get(
  "/:organizationId",
  requireAuth,
  requireOrganization,
  getOrganization,
);

export default router;