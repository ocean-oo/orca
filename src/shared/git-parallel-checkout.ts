// Why: git materializes worktree files sequentially by default, which made
// `git worktree add` take ~8s on a ~7k-file repo on Windows (NTFS + Defender
// serialize each file create). checkout.workers=0 spreads the checkout across
// one worker per core (~3x faster measured); git's own
// checkout.thresholdForParallelism keeps small checkouts sequential, and git
// releases before 2.32 ignore the unknown key, so this degrades safely.
export const GIT_PARALLEL_CHECKOUT_CONFIG_ARGS = ['-c', 'checkout.workers=0'] as const
