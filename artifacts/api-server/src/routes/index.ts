import { Router, type IRouter } from "express";
import healthRouter from "./health";
import playersRouter from "./players";
import teamsRouter from "./teams";
import tournamentsRouter from "./tournaments";
import matchesRouter from "./matches";
import rankingsRouter from "./rankings";
import newsRouter from "./news";
import mediaRouter from "./media";
import statsRouter from "./stats";
import storageRouter from "./storage";
import communityRouter from "./community";
import seasonsRouter from "./seasons";

const router: IRouter = Router();

router.use(healthRouter);
router.use(playersRouter);
router.use(teamsRouter);
router.use(tournamentsRouter);
router.use(matchesRouter);
router.use(rankingsRouter);
router.use(newsRouter);
router.use(mediaRouter);
router.use(statsRouter);
router.use(storageRouter);
router.use(communityRouter);
router.use(seasonsRouter);
// Note: auth routes are mounted directly in app.ts

export default router;
