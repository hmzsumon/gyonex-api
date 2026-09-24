# Staking controls

The admin `/staking` page manages global settings and packages. All settings,
package writes (including bulk writes), and manual profit runs require admin authentication.

- New subscriptions can be enabled or paused independently of profit payouts.
- The seven weekday checkboxes control earning days in Asia/Dhaka. An empty selection pays no profit.
- Schedule changes take effect on the current Bangladesh calendar day. Policy history prevents later jobs from paying dates that were paused or excluded. Already posted payments are not reversed.
- Package duration remains calendar days; excluded days do not extend maturity. Principal returns still run when payouts are paused or the current weekday is excluded.
- Daily gross profit, the user's share, minimum amount, duration and availability are editable. Rate/share edits apply to new subscriptions. Existing contracts retain their rate/share (legacy subscriptions retain their previous duration-based share).
- Cancellation fees are a percentage of principal, bounded from 0 through 100. The current fee is shown before cancellation. Defaults are staking enabled, profit enabled, all seven weekdays, and zero cancellation fee; review these controls after deployment.
- New contracts use Dhaka profit ledger keys. Existing contracts retain their original ledger date convention to prevent duplicate historical payouts.
- Additional loan repayment service fees are disabled, even when a prior database setting contains a nonzero fee. The loan's existing contractual interest is unchanged. No historical repayments are rewritten.

Run the regression checks without connecting to a database:

```sh
node tests/staking-controls.test.cjs
```

Mocks cover schedule boundaries, paused days, deduplication, contract shares,
settings validation, staking pauses, cancellation calculations, and actual repayment controller debits.
