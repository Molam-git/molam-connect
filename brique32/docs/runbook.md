# Runbook - Brique 32 UI Ops

## Procédures Opérationnelles

### 1. Création d'un Freeze Payouts Urgent

**Scénario**: Gel des paiements pour une zone spécifique suite à un incident partenaire.

**Étapes**:
1. **Créer le Plan**:
   - Titre: "Freeze Payouts - [ZONE] - [DATE]"
   - Description: Décrire l'incident et la raison du freeze
   - Sévérité: HIGH (requiert 2 approbations)
   - Scope: `{ "type": "zone", "id": "SN-DKR" }`
   - Actions: 
     ```json
     [
       { "name": "freeze_payouts", "params": { "zone": "SN-DKR", "reason": "partner outage" } },
       { "name": "notify_partner", "params": { "partner_id": "partner-uuid", "message": "Payouts frozen due to incident" } }
     ]
     ```

2. **Dry-run**: Exécuter la simulation pour vérifier l'impact
3. **Soumettre à l'approbation**: Notifier les approbateurs (ops_manager + cfo)
4. **Exécution**: Une fois approuvé, lancer l'exécution
5. **Monitoring**: Surveiller les logs d'actions dans l'UI
6. **Rollback automatique**: Si >5% d'échecs, rollback automatique

### 2. Pause d'un Partenaire

**Scénario**: Suspension temporaire d'un partenaire pour cause de fraude.

**Étapes**:
1. **Créer le Plan** avec sévérité CRITICAL (3 approbations)
2. **Actions**:
   ```json
   [
     { "name": "pause_partner", "params": { "partner_id": "uuid", "reason": "suspected fraud" } },
     { "name": "freeze_payouts", "params": { "partner_id": "uuid" } },
     { "name": "notify_compliance", "params": { "partner_id": "uuid", "alert_level": "high" } }
   ]