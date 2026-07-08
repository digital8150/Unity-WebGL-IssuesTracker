import 'dotenv/config';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from './src/models/User.js';
import Game from './src/models/Game.js';
import Leaderboard from './src/models/Leaderboard.js';
import GameConfig from './src/models/GameConfig.js';

await mongoose.connect(process.env.MONGO_URI);

let user = await User.findOne({ email: 'uitest@example.com' });
if (!user) {
  user = await User.create({ name: 'UI Test', email: 'uitest@example.com', status: 'approved', role: 'user' });
} else {
  user.status = 'approved';
  await user.save();
}

let game = await Game.findOne({ slug: 'ui-test-game' });
if (!game) {
  game = await Game.create({
    name: 'UI Test Game',
    slug: 'ui-test-game',
    ownerId: user._id,
    serverBackend: { leaderboardEnabled: true, configEnabled: true, secret: 'test-secret-123' },
  });
}

let lb = await Leaderboard.findOne({ gameId: game._id, key: 'high-score' });
if (!lb) {
  lb = await Leaderboard.create({
    gameId: game._id,
    key: 'high-score',
    label: 'High Score',
    sort: 'desc',
    maxEntries: 10,
    entries: [
      { name: 'Alice', score: 950, meta: { level: 5, char: 'mage' } },
      { name: 'Bob', score: 700, meta: null },
      { name: 'Zara', score: 1200, meta: { level: 9 } },
      { name: 'ash', score: 300, meta: null },
    ],
  });
}

let cfg = await GameConfig.findOne({ gameId: game._id, key: 'balance' });
if (!cfg) {
  cfg = await GameConfig.create({
    gameId: game._id,
    key: 'balance',
    value: JSON.stringify({ maxHp: 100, speed: 5.5, enemyTypes: ['goblin', 'orc'], boss: { hp: 500, name: 'Doom' }, easyMode: false }),
  });
}

const token = jwt.sign({ sub: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
console.log(JSON.stringify({ token, gameId: game._id.toString() }));
await mongoose.disconnect();
