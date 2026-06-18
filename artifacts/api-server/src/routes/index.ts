import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pollsRouter from "./polls";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pollsRouter);

export default router;
