import { Router } from 'express';
import { Issue } from '../models/Issue.js';
import Game from '../models/Game.js';
import { sendDiscordNotification } from '../services/discord.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.title || typeof body.title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }

    const issue = await Issue.create(body);

    // Fire-and-forget — don't block the response on Discord.
    (async () => {
      try {
        const game = issue.gameId ? await Game.findById(issue.gameId).select('discordWebhookUrl').lean() : null;
        await sendDiscordNotification(issue, game?.discordWebhookUrl || '');
      } catch (err) {
        console.warn('[discord] notification failed:', err.message);
      }
    })();

    res.status(201).json({ id: issue._id });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const issues = await Issue.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .select('title description createdAt productName version');
    res.json(issues);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Not found' });
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

export default router;
