# docs/api.md
## API KYC - Endpoints

### POST /api/kyc/upload
Démarre un upload de document
Body: { document_type_code, filename, country }
Response: { docId, presignedUrl, fields }

### POST /api/kyc/finish  
Finalise l'upload et déclenche la vérification
Body: { docId, checksum }

### GET /api/kyc/status
Récupère le statut KYC de l'utilisateur

### GET /api/kyc/policies
Récupère la liste des documents requis
Query: country, account_type