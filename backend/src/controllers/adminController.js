import User from '../models/User.js';
import PosterProject from '../models/PosterProject.js';
import PosterTemplateAsset from '../models/PosterTemplateAsset.js';

/**
 * Get dashboard overview stats
 */
export async function getStats(req, res) {
  try {
    const totalUsers = await User.countDocuments();

    // Active in last 30 days
    const activeThreshold = new Date();
    activeThreshold.setDate(activeThreshold.getDate() - 30);
    const activeUsers = await User.countDocuments({
      lastActiveAt: { $gte: activeThreshold }
    });

    const totalProjects = await PosterProject.countDocuments();
    const totalTemplates = await PosterTemplateAsset.countDocuments();

    res.json({
      stats: {
        totalUsers,
        activeUsers,
        totalProjects,
        totalTemplates
      }
    });
  } catch (error) {
    console.error('Admin Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch admin statistics' });
  }
}

/**
 * Get paginated list of users for management
 */
export async function getUsers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.search) {
      query.$or = [
        { email: { $regex: req.query.search, $options: 'i' } },
        { name: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      users: users.map(u => ({
        id: u._id,
        email: u.email,
        name: u.name,
        role: u.role,
        plan: u.plan,
        lastActiveAt: u.lastActiveAt,
        createdAt: u.createdAt
      })),
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    });
  } catch (error) {
    console.error('Admin GetUsers error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

/**
 * Update a user's role or plan
 */
export async function updateUser(req, res) {
  try {
    const { userId } = req.params;
    const { role, plan } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (role) {
      if (!['user', 'creator', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      user.role = role;
    }

    if (plan) {
      if (!['free', 'pro'].includes(plan)) {
        return res.status(400).json({ error: 'Invalid plan' });
      }
      user.plan = plan;
    }

    await user.save({ validateBeforeSave: false });

    res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        plan: user.plan
      }
    });
  } catch (error) {
    console.error('Admin UpdateUser error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
}
