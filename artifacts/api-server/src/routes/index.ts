import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import documentsRouter from "./documents";
import subscriptionsRouter from "./subscriptions";
import sessionsRouter from "./sessions";
import monitorRouter from "./monitor";
import backupRouter from "./backup";
import recoveryRouter from "./recovery";
import shareRouter from "./share";
import businessRouter from "./business";
import { generalLimiter } from "../middlewares/rateLimit";

const router: IRouter = Router();

router.use(generalLimiter);

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/recovery", recoveryRouter);
router.use("/documents", documentsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/sessions", sessionsRouter);
router.use("/monitor", monitorRouter);
router.use("/backup", backupRouter);
router.use("/share", shareRouter);
router.use("/businesses", businessRouter);

export default router;
