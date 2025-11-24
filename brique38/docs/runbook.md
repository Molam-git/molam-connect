# Runbook - Gestion des Litiges

## Procédure de Tri
1. Vérifier l'origine du litige
2. Contrôler les preuves attachées
3. Appliquer les règles automatiques
4. Assigner à un ops si nécessaire

## Matrice d'Escalation
- Niveau 1: Ops Agent (72h)
- Niveau 2: Pay Admin (24h supplémentaires)
- Niveau 3: Arbiter (multi-signature)

## Legal Hold
Pour mettre un litige en conservation légale:
```sql
UPDATE disputes SET status='legal_hold' WHERE id='<dispute_id>';