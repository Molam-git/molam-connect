import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

const resources = {
    en: {
        t: {
            balance: 'Balance', send: 'Transfer', qr: 'QR', bank: 'Bank', agents: 'Agents', bills: 'Bills',
            history: 'History', settings: 'Settings', legal: 'Legal', siraBest: 'Best route by Sira',
            amount: 'Amount', to: 'To', estimate: 'Estimate', fee: 'Fee', total: 'Total', confirm: 'Confirm',
            myQR: 'My QR', scanToPay: 'Scan to pay', routes: 'Bank routes', cashIn: 'Cash-In', cashOut: 'Cash-Out',
            forSelf: 'For myself', recipient: 'Recipient', findAgents: 'Find agents nearby',
            cgu: 'Terms', privacy: 'Privacy', legalDocs: 'Legal'
        }
    },
    fr: {
        t: {
            balance: 'Solde', send: 'Transfert', qr: 'QR', bank: 'Banque', agents: 'Agents', bills: 'Factures',
            history: 'Historique', settings: 'Paramètres', legal: 'Légal', siraBest: 'Meilleure route par Sira',
            amount: 'Montant', to: 'Vers', estimate: 'Estimation', fee: 'Frais', total: 'Total', confirm: 'Confirmer',
            myQR: 'Mon QR', scanToPay: 'Scanner pour payer', routes: 'Routes bancaires', cashIn: 'Dépôt', cashOut: 'Retrait',
            forSelf: 'Pour moi', recipient: 'Bénéficiaire', findAgents: 'Trouver des agents proches',
            cgu: 'CGU', privacy: 'Confidentialité', legalDocs: 'Mentions légales'
        }
    }
};
i18n.use(initReactI18next).init({
    resources, lng: 'en', // default per spec
    fallbackLng: 'en',
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false }
});
export default i18n;