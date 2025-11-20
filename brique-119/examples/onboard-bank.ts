/**
 * Example: Onboard a New Bank and Create Treasury Accounts
 *
 * This example demonstrates:
 * 1. Onboarding a new bank partner
 * 2. Creating multiple treasury accounts (EUR, USD, GBP)
 * 3. Setting up SLA tracking
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3000/api/banks';

async function main() {
  try {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Example: Onboard Bank & Create Treasury Accounts        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Step 1: Onboard a new bank
    console.log('Step 1: Onboarding European Bank...');
    const bankResponse = await axios.post(`${API_BASE}/onboard`, {
      name: 'European Bank SA',
      bic_code: 'EURBFRPP',
      country_code: 'FR',
      api_endpoint: 'https://api.europeanbank.fr',
      contact_email: 'integration@europeanbank.fr',
      contact_phone: '+33123456789',
      sla_settlement_days: 2,
      sla_availability: 99.95,
      sla_max_failure_rate: 0.5,
      api_version: 'v1',
      supports_webhooks: true,
      webhook_url: 'https://molam.com/webhooks/europeanbank'
    });

    const bank = bankResponse.data.bank;
    console.log(`✅ Bank onboarded: ${bank.name} (${bank.id})`);
    console.log(`   Status: ${bank.status}`);
    console.log(`   BIC: ${bank.bic_code}`);
    console.log('');

    // Step 2: Create treasury accounts
    console.log('Step 2: Creating treasury accounts...');

    // EUR Operational Account (default)
    const eurAccount = await axios.post(`${API_BASE}/${bank.id}/accounts`, {
      account_number: 'FR7612345678901234567890123',
      account_name: 'EUR Operational Account',
      currency: 'EUR',
      account_type: 'operational',
      balance: 5000000,
      min_balance: 50000,
      is_default: true,
      reconciliation_frequency: 'daily'
    });
    console.log(`✅ EUR account created: ${eurAccount.data.account.account_number}`);
    console.log(`   Balance: €${parseFloat(eurAccount.data.account.balance).toLocaleString()}`);

    // USD Reserve Account
    const usdAccount = await axios.post(`${API_BASE}/${bank.id}/accounts`, {
      account_number: 'US1234567890123456789012',
      account_name: 'USD Reserve Account',
      currency: 'USD',
      account_type: 'reserve',
      balance: 2000000,
      min_balance: 100000,
      reconciliation_frequency: 'daily'
    });
    console.log(`✅ USD account created: ${usdAccount.data.account.account_number}`);
    console.log(`   Balance: $${parseFloat(usdAccount.data.account.balance).toLocaleString()}`);

    // GBP Payout Account
    const gbpAccount = await axios.post(`${API_BASE}/${bank.id}/accounts`, {
      account_number: 'GB12BANK12345678901234',
      account_name: 'GBP Payout Account',
      currency: 'GBP',
      account_type: 'payout',
      balance: 1000000,
      min_balance: 25000,
      reconciliation_frequency: 'daily'
    });
    console.log(`✅ GBP account created: ${gbpAccount.data.account.account_number}`);
    console.log(`   Balance: £${parseFloat(gbpAccount.data.account.balance).toLocaleString()}`);
    console.log('');

    // Step 3: Activate the bank
    console.log('Step 3: Activating bank...');
    await axios.patch(`${API_BASE}/${bank.id}/status`, {
      status: 'active',
      reason: 'All certifications validated and accounts configured'
    });
    console.log(`✅ Bank activated`);
    console.log('');

    // Step 4: Record initial SLA metrics
    console.log('Step 4: Recording initial SLA metrics...');
    const yesterday = new Date(Date.now() - 86400000);
    const today = new Date();

    await axios.post(`${API_BASE}/${bank.id}/sla/track`, {
      measurement_period: 'daily',
      period_start: yesterday.toISOString(),
      period_end: today.toISOString(),
      total_transactions: 1000,
      successful_transactions: 998,
      failed_transactions: 2,
      avg_settlement_time_hours: 36,
      max_settlement_time_hours: 47,
      on_time_settlements: 995,
      late_settlements: 3,
      uptime_seconds: 86000,
      downtime_seconds: 400
    });
    console.log(`✅ SLA metrics recorded`);
    console.log('');

    // Step 5: Get bank details
    console.log('Step 5: Fetching bank details...');
    const detailsResponse = await axios.get(`${API_BASE}/${bank.id}`);
    const details = detailsResponse.data;

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Bank Summary                                             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`Bank: ${details.bank.name}`);
    console.log(`Status: ${details.bank.status}`);
    console.log(`Country: ${details.bank.country_code}`);
    console.log(`Treasury Accounts: ${details.treasury_accounts.length}`);
    console.log(`SLA History: ${details.sla_history.length} records`);
    console.log(`Recent Events: ${details.recent_events.length} events`);
    console.log('');

    console.log('Treasury Accounts:');
    details.treasury_accounts.forEach((acc: any) => {
      console.log(`  • ${acc.currency} ${acc.account_type} - Balance: ${parseFloat(acc.balance).toLocaleString()}`);
    });
    console.log('');

    // Step 6: Check SLA compliance
    console.log('Step 6: Checking SLA compliance...');
    const slaResponse = await axios.get(`${API_BASE}/${bank.id}/sla`);
    const sla = slaResponse.data.compliance;

    console.log('SLA Compliance:');
    console.log(`  Status: ${sla.compliance_status}`);
    console.log(`  Failure Rate OK: ${sla.failure_rate_ok ? '✅' : '❌'}`);
    console.log(`  Availability OK: ${sla.availability_ok ? '✅' : '❌'}`);
    console.log(`  Settlement Time OK: ${sla.settlement_time_ok ? '✅' : '❌'}`);
    console.log('');

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Example Completed Successfully!                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

main();
