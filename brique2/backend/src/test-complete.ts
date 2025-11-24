// test-compile.ts
console.log('=== VÉRIFICATION DE COMPILATION ===');

// Ces imports vérifient que tous les types sont corrects
import './db';
import './services/transactionService';
import './middleware/auth';
import './routes/transactions';

console.log('🎉 TOUS LES FICHIERS COMPILENT SANS ERREUR!');
console.log('🚀 Démarrage du serveur: npm run dev');