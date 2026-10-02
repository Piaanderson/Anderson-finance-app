\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

SELECT jsonb_build_object(
  'server_version', current_setting('server_version'),
  'counts', jsonb_build_object(
    'migrations', (SELECT count(*) FROM "_prisma_migrations"),
    'households', (SELECT count(*) FROM "Household"),
    'users', (SELECT count(*) FROM "User"),
    'memberships', (SELECT count(*) FROM "HouseholdMember"),
    'plaid_items', (SELECT count(*) FROM "PlaidItem"),
    'plaid_active', (SELECT count(*) FROM "PlaidItem" WHERE status = 'ACTIVE'),
    'plaid_login_required', (SELECT count(*) FROM "PlaidItem" WHERE status = 'LOGIN_REQUIRED'),
    'plaid_error', (SELECT count(*) FROM "PlaidItem" WHERE status = 'ERROR'),
    'plaid_removed', (SELECT count(*) FROM "PlaidItem" WHERE status = 'REMOVED'),
    'financial_accounts', (SELECT count(*) FROM "FinancialAccount"),
    'account_snapshots', (SELECT count(*) FROM "AccountPositionSnapshot"),
    'transactions', (SELECT count(*) FROM "Transaction"),
    'transfer_matches', (SELECT count(*) FROM "TransferMatch"),
    'categories', (SELECT count(*) FROM "Category"),
    'merchant_rules', (SELECT count(*) FROM "MerchantRule"),
    'budget_months', (SELECT count(*) FROM "BudgetMonth"),
    'budget_allocations', (SELECT count(*) FROM "BudgetAllocation"),
    'property_debt_links', (SELECT count(*) FROM "PropertyDebtLink"),
    'sync_jobs', (SELECT count(*) FROM "SyncJob"),
    'sync_pending', (SELECT count(*) FROM "SyncJob" WHERE status = 'PENDING'),
    'sync_running', (SELECT count(*) FROM "SyncJob" WHERE status = 'RUNNING'),
    'sync_failed', (SELECT count(*) FROM "SyncJob" WHERE status = 'FAILED')
  ),
  'token_metadata', jsonb_build_object(
    'missing_fields', (
      SELECT count(*)
      FROM "PlaidItem"
      WHERE "accessTokenCiphertext" = ''
         OR "accessTokenIv" = ''
         OR "accessTokenTag" = ''
    ),
    'key_versions', (
      SELECT COALESCE(jsonb_object_agg("encryptionKeyVersion", count), '{}'::jsonb)
      FROM (
        SELECT "encryptionKeyVersion", count(*) AS count
        FROM "PlaidItem"
        GROUP BY "encryptionKeyVersion"
      ) AS versions
    )
  ),
  'integrity_errors', jsonb_build_object(
    'membership_refs', (
      SELECT count(*)
      FROM "HouseholdMember" AS member
      LEFT JOIN "Household" AS household ON household.id = member."householdId"
      LEFT JOIN "User" AS app_user ON app_user.id = member."userId"
      WHERE household.id IS NULL OR app_user.id IS NULL
    ),
    'plaid_refs', (
      SELECT count(*)
      FROM "PlaidItem" AS item
      LEFT JOIN "Household" AS household ON household.id = item."householdId"
      LEFT JOIN "User" AS app_user ON app_user.id = item."linkedByUserId"
      WHERE household.id IS NULL OR app_user.id IS NULL
    ),
    'account_household_or_item', (
      SELECT count(*)
      FROM "FinancialAccount" AS account
      LEFT JOIN "Household" AS household ON household.id = account."householdId"
      LEFT JOIN "PlaidItem" AS item ON item.id = account."plaidItemId"
      WHERE household.id IS NULL
         OR (
           account."plaidItemId" IS NOT NULL
           AND (item.id IS NULL OR item."householdId" <> account."householdId")
         )
    ),
    'snapshot_account', (
      SELECT count(*)
      FROM "AccountPositionSnapshot" AS snapshot
      LEFT JOIN "FinancialAccount" AS account ON account.id = snapshot."accountId"
      WHERE account.id IS NULL OR account."householdId" <> snapshot."householdId"
    ),
    'transaction_refs', (
      SELECT count(*)
      FROM "Transaction" AS transaction
      LEFT JOIN "FinancialAccount" AS account ON account.id = transaction."accountId"
      LEFT JOIN "Category" AS category ON category.id = transaction."categoryId"
      WHERE account.id IS NULL
         OR account."householdId" <> transaction."householdId"
         OR (
           transaction."categoryId" IS NOT NULL
           AND (
             category.id IS NULL
             OR category."householdId" <> transaction."householdId"
           )
         )
    ),
    'transfer_legs', (
      SELECT count(*)
      FROM "TransferMatch" AS transfer
      LEFT JOIN "Transaction" AS outgoing
        ON outgoing.id = transfer."outgoingTransactionId"
      LEFT JOIN "Transaction" AS incoming
        ON incoming.id = transfer."incomingTransactionId"
      WHERE outgoing.id IS NULL
         OR incoming.id IS NULL
         OR outgoing."householdId" <> transfer."householdId"
         OR incoming."householdId" <> transfer."householdId"
         OR outgoing.id = incoming.id
    ),
    'budget_refs', (
      SELECT count(*)
      FROM "BudgetAllocation" AS allocation
      LEFT JOIN "BudgetMonth" AS budget_month
        ON budget_month.id = allocation."budgetMonthId"
      LEFT JOIN "Category" AS category ON category.id = allocation."categoryId"
      LEFT JOIN "FinancialAccount" AS destination
        ON destination.id = allocation."destinationAccountId"
      WHERE budget_month.id IS NULL
         OR category.id IS NULL
         OR category."householdId" <> budget_month."householdId"
         OR (
           allocation."destinationAccountId" IS NOT NULL
           AND (
             destination.id IS NULL
             OR destination."householdId" <> budget_month."householdId"
           )
         )
    ),
    'property_debt_refs', (
      SELECT count(*)
      FROM "PropertyDebtLink" AS link
      LEFT JOIN "FinancialAccount" AS property
        ON property.id = link."propertyAccountId"
      LEFT JOIN "FinancialAccount" AS debt ON debt.id = link."debtAccountId"
      WHERE property.id IS NULL
         OR debt.id IS NULL
         OR property."householdId" <> link."householdId"
         OR debt."householdId" <> link."householdId"
         OR property.classification <> 'PROPERTY'
         OR debt.classification <> 'DEBT'
    ),
    'merchant_rule_refs', (
      SELECT count(*)
      FROM "MerchantRule" AS merchant_rule
      LEFT JOIN "Category" AS category ON category.id = merchant_rule."categoryId"
      WHERE category.id IS NULL
         OR category."householdId" <> merchant_rule."householdId"
    ),
    'sync_job_refs', (
      SELECT count(*)
      FROM "SyncJob" AS sync_job
      LEFT JOIN "PlaidItem" AS item ON item.id = sync_job."plaidItemId"
      WHERE item.id IS NULL
    )
  )
);
