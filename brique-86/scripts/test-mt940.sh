#!/bin/bash

# Test MT940 parser with sample file

set -e

echo "🧪 Testing MT940 Parser"
echo "======================="
echo ""

# Create sample MT940 file
cat > /tmp/sample_statement.mt940 <<'EOF'
:20:STATEMENT123456
:25:DE89370400440532013000
:28C:00001/001
:60F:C231101EUR10000,00
:61:2311151115C1000,00NTRFNONREF//PO_TEST_001
:86:?20Payment from customer?32John Doe Corporation
:61:2311161116C2500,50NTRFNONREF//tr_test_002
:86:?20Payout settlement?32Acme Inc
:61:2311171117D150,00NTRFNONREF//FEE_BANK
:86:?20Bank transfer fee
:62F:C231117EUR13350,50
EOF

echo "✅ Sample MT940 file created at /tmp/sample_statement.mt940"
echo ""
echo "File contents:"
echo "----------------------------------------"
cat /tmp/sample_statement.mt940
echo "----------------------------------------"
echo ""

# Parse with Node.js
node -e "
const fs = require('fs');
const { parseMT940 } = require('./dist/parsers/mt940.js');

const content = fs.readFileSync('/tmp/sample_statement.mt940', 'utf8');
const lines = parseMT940(content);

console.log('✅ Parsed', lines.length, 'transactions:');
console.log('');

lines.forEach((line, idx) => {
  console.log(\`Transaction \${idx + 1}:\`);
  console.log(\`  Date: \${line.value_date}\`);
  console.log(\`  Amount: \${line.currency} \${line.amount}\`);
  console.log(\`  Type: \${line.transaction_type}\`);
  console.log(\`  Reference: \${line.reference || 'none'}\`);
  console.log(\`  Provider Ref: \${line.provider_ref || 'none'}\`);
  console.log(\`  Description: \${line.description}\`);
  console.log('');
});
"

echo "🎉 Parser test complete!"
