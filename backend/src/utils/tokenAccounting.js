import User from '../models/User.js';

/**
 * Atomically increment a user's token usage for the current period.
 * Returns the updated tokensUsedThisPeriod value.
 *
 * Uses MongoDB $inc so concurrent requests don't overwrite each other.
 */
export async function incrementTokenUsage(userId, tokensToAdd) {
  if (!tokensToAdd || tokensToAdd <= 0) return 0;

  const updated = await User.findByIdAndUpdate(
    userId,
    { $inc: { tokensUsedThisPeriod: tokensToAdd } },
    { new: true, select: 'tokensUsedThisPeriod' }
  );
  return updated?.tokensUsedThisPeriod ?? 0;
}
