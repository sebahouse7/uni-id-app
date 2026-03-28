import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import documentsRouter from "./documents";
import subscriptionsRouter from "./subscriptions";
import sessionsRouter from "./sessions";
import monitorRouter from "./monitor";
import backupRouter from "./backup";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/documents", documentsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/sessions", sessionsRouter);
router.use("/monitor", monitorRouter);
router.use("/backup", backupRouter);

export default router;
