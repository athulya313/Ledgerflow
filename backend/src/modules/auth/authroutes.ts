
import { Router } from "express";
import { login, register ,logout} from "./authcontroller.js";
import { me } from "./authcontroller.js";
import { requireAuth } from "./authmiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
export default router;