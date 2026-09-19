import { Router, type IRouter } from "express";
import healthRouter from "./health";
import alibiRouter from "./alibi";

const router: IRouter = Router();

router.use(healthRouter);
router.use(alibiRouter);

export default router;
