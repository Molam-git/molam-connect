# 🚀 Molam Connect - Unified Payment Infrastructure

**Production-ready payment infrastructure for Africa, combining multiple SDKs, authentication services, and intelligent risk management.**

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-13%2B-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 📖 Overview

Molam Connect is a comprehensive payment platform that integrates:

- **🔒 Adaptive Authentication** - Intelligent 3DS2/OTP decision engine
- **💳 Payment Processing** - Card, mobile money, bank transfers
- **🌍 Multi-Region Support** - Optimized for West Africa and global markets
- **📱 Client SDKs** - Web and React Native SDKs
- **🛡️ Security First** - PCI DSS compliant, PSD2 SCA ready

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Molam Connect Server                     │
│                      (Node.js/Express)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Payment API  │  │  Auth API    │  │   OTP API    │     │
│  │ (Brique Core)│  │ (Brique 106b)│  │ (Brique 106b)│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   SIRA Risk  │  │  BIN Lookup  │  │ Device Trust │     │
│  │   Scoring    │  │   Service    │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ↓                  ↓                  ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │  │    Redis     │  │   Twilio     │
│   Database   │  │   Cache      │  │  SMS/Voice   │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 🎯 Features

### Core Payment Processing
- ✅ Payment Intent creation and confirmation
- ✅ Customer management
- ✅ Payment method tokenization
- ✅ Idempotency support
- ✅ Webhook events

### Intelligent Authentication
- ✅ **SIRA Risk Scoring** - Real-time risk assessment (0-100)
- ✅ **Adaptive Auth Selection** - Dynamic 3DS2/OTP/Biometric choice
- ✅ **Device Trust** - "Remember device" with scoring
- ✅ **Fallback Chains** - 3DS2 → 3DS1 → OTP SMS → OTP Voice
- ✅ **Country-Specific Routing** - Orange SMS for West Africa

### OTP Service
- ✅ SMS and Voice delivery
- ✅ Argon2 secure hashing
- ✅ Rate limiting (anti-abuse)
- ✅ Multi-provider support (Twilio, Orange SMS)
- ✅ Delivery tracking and retries

### Client SDKs

#### Web SDK (Brique 106)
- Hosted iFrame fields (PCI compliant)
- Tokenization
- 3DS2 challenge handling
- Event-driven architecture

#### React Native SDK (Brique 106)
- Native iOS (Swift) and Android (Kotlin) bridges
- Native payment sheets
- Biometric authentication
- Offline support

---

## 📦 Project Structure

```
molam-connect/
├── brique-104/             # PHP Server SDK
├── brique-105/             # Python Server SDK
├── brique-106/             # Client SDKs (Web + React Native)
│   ├── web-sdk/            # Web SDK
│   ├── react-native-sdk/   # React Native SDK
│   ├── auth-service/       # Auth Decision Service (Brique 106bis)
│   └── examples/           # Integration examples
├── database/               # PostgreSQL schemas
│   └── setup.sql          # Consolidated database setup
├── public/                 # Test Dashboard
│   ├── index.html         # Dashboard UI
│   ├── styles.css         # Dashboard styles
│   └── app.js             # Dashboard logic
├── server.js              # Main Express server
├── package.json           # Dependencies
├── .env                   # Configuration (dev)
├── .env.example           # Configuration template
├── start.bat              # Windows startup script
├── start.sh               # Unix/Linux/Mac startup script
└── QUICK_START.md         # Quick start guide
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **PostgreSQL** ≥ 13
- **Redis** (optional, recommended)

### Installation

1. **Clone or navigate to the project:**
   ```bash
   cd molam-connect
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup database:**
   ```bash
   # Create database
   npm run db:create

   # Run migrations
   npm run db:setup
   ```

4. **Start the server:**

   **Windows:**
   ```bash
   start.bat
   ```

   **Mac/Linux:**
   ```bash
   chmod +x start.sh
   ./start.sh
   ```

   **Or directly:**
   ```bash
   npm start
   ```

5. **Open the dashboard:**
   ```
   http://localhost:3000/dashboard
   ```

---

## 🧪 Testing

### Via Dashboard

Open **http://localhost:3000/dashboard** and test all APIs visually:

- 💳 **Payment Intent** - Create and confirm payments
- 🔒 **Auth Decision** - Test SIRA risk scoring
- 📱 **OTP** - Generate and verify OTP codes
- 👤 **Customer** - Create customers
- 📊 **Logs** - Monitor real-time activity

### Via API (curl)

**Create Payment Intent:**
```bash
curl -X POST http://localhost:3000/api/v1/payment_intents \
  -H "Content-Type: application/json" \
  -d '{"amount": 10000, "currency": "XOF", "description": "Test payment"}'
```

**Make Auth Decision:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/decide \
  -H "Content-Type: application/json" \
  -d '{
    "payment_id": "pi_test_123",
    "amount": 50000,
    "currency": "XOF",
    "country": "SN",
    "bin": "424242",
    "device": {"ip": "192.168.1.1"}
  }'
```

**Create OTP:**
```bash
curl -X POST http://localhost:3000/api/v1/otp/create \
  -H "Content-Type: application/json" \
  -d '{"phone": "+221771234567", "method": "sms"}'
```

**Note:** In development mode, OTP codes are logged to the server console.

---

## 📊 API Endpoints

### Payment Intents

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/payment_intents` | POST | Create payment intent |
| `/api/v1/payment_intents/:id` | GET | Retrieve payment intent |
| `/api/v1/payment_intents/:id/confirm` | POST | Confirm payment |

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/decide` | POST | Make auth decision |
| `/api/v1/auth/outcome` | POST | Record auth outcome |
| `/api/v1/auth/fallback` | POST | Update fallback method |

### OTP

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/otp/create` | POST | Generate and send OTP |
| `/api/v1/otp/verify` | POST | Verify OTP code |
| `/api/v1/otp/resend` | POST | Resend OTP |

### Customers

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/customers` | POST | Create customer |

### Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check + DB status |

---

## 🗄️ Database Schema

The consolidated database includes:

- **customers** - Customer information
- **payment_intents** - Payment transactions
- **payment_methods** - Tokenized payment methods
- **auth_decisions** - Authentication decisions (SIRA)
- **otp_requests** - OTP lifecycle management
- **device_trust** - Device trust scoring
- **server_idempotency** - Idempotency keys
- **webhook_events** - Webhook event log
- **webhook_deliveries** - Webhook delivery tracking

See [`database/setup.sql`](database/setup.sql) for complete schema.

---

## 🔐 Security

### Production Checklist

- [ ] Change all default secrets in `.env`
- [ ] Enable HTTPS (TLS)
- [ ] Configure PostgreSQL SSL
- [ ] Set up Vault for secrets management
- [ ] Configure rate limiting
- [ ] Enable Helmet security headers
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategy
- [ ] Review CORS origins
- [ ] Enable audit logging

### PCI DSS Compliance

- ✅ No card data stored (tokenization only)
- ✅ TLS for all communications
- ✅ Argon2 hashing for OTP
- ✅ Rate limiting and fraud detection
- ✅ Complete audit trail

---

## 📚 Documentation

- **[QUICK_START.md](QUICK_START.md)** - Getting started guide
- **[Brique 104](brique-104/README.md)** - PHP SDK Documentation
- **[Brique 105](brique-105/README.md)** - Python SDK Documentation
- **[Brique 106](brique-106/README.md)** - Client SDKs Documentation
- **[Brique 106bis](brique-106/auth-service/README.md)** - Auth Service Documentation

---

## 🛠️ Development

### NPM Scripts

```bash
npm start              # Start server
npm run dev            # Start with nodemon (auto-reload)
npm test               # Run tests
npm run db:create      # Create database
npm run db:setup       # Run migrations
npm run db:reset       # Drop, create, and setup database
npm run lint           # Lint code
npm run format         # Format code
```

### Environment Variables

See [`.env.example`](.env.example) for all available configuration options.

---

## 🌍 Deployment

### Docker

```bash
docker build -t molam-connect:latest .
docker run -p 3000:3000 --env-file .env molam-connect:latest
```

### Docker Compose

```bash
docker-compose up -d
```

### Kubernetes

See deployment manifests in `deploy/kubernetes/`

---

## 📈 Monitoring

- **Health Check**: `/health`
- **Metrics**: (Future) Prometheus metrics on `:9090/metrics`
- **Logs**: Structured JSON logs (Winston)
- **Database**: Query performance monitoring

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- **SIRA** - Risk scoring engine
- **Twilio** - SMS/Voice infrastructure
- **Orange** - SMS services for West Africa
- **PostgreSQL** - Reliable database
- **Redis** - Fast caching and rate limiting

---

## 📞 Support

- **Email**: support@molam.io
- **Dashboard**: http://localhost:3000/dashboard
- **Health Check**: http://localhost:3000/health
- **GitHub Issues**: https://github.com/molam/molam-connect/issues

---

**Made with ❤️ by the Molam team**

**🚀 Ready for Production | 🌍 Built for Africa | 🔒 Security First**
