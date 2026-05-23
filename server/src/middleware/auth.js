import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch { /* ignore invalid token */ }
  }
  next();
}

// Run AFTER requireAuth. Verifies the user's account is approved.
export async function requireApproved(req, res, next) {
  try {
    const user = await User.findById(req.user.sub).select('status role');
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.status !== 'approved') {
      return res.status(403).json({ error: 'Account pending approval', status: user.status });
    }
    req.user.role = user.role;
    req.user.status = user.status;
    next();
  } catch (err) {
    next(err);
  }
}

// Run AFTER requireAuth + requireApproved. Verifies admin role.
export async function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}
