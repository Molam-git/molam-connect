# Runbook: SLO Violation

**Alert:** `SLOViolation30Day` or `ErrorBudgetBurnRateHigh`
**Severity:** Critical
**Component:** routing-service
**Impact:** Business-critical SLO targets not being met

---

## Summary

The routing service has violated its Service Level Objective (SLO). This is a business-critical issue that requires immediate escalation and detailed incident response.

## SLO Targets

| Metric | Target | Measurement Window |
|--------|--------|-------------------|
| **Availability** | 99.95% success rate | 30 days |
| **Latency** | P95 < 120ms | 30 days |

**Error Budget:** 0.05% of requests (approximately 21.6 minutes of downtime per 30 days)

## Alert Types

### 1. SLOViolation30Day
- 30-day success rate has fallen below 99.95%
- Error budget exhausted
- Immediate action required

### 2. ErrorBudgetBurnRateHigh
- Error budget burning faster than sustainable
- Predicts SLO violation if trend continues
- Proactive intervention needed

## Impact

### Business Impact
- **Customer Trust:** SLO violations may trigger SLA penalties
- **Revenue:** Extended outages directly impact payment processing volume
- **Reputation:** Partner confidence may be affected

### Technical Impact
- **On-call Load:** Increased incident response burden
- **Team Morale:** Stress from repeated incidents
- **Technical Debt:** Indicates systemic issues requiring investment

## Triage Steps

### 1. Verify SLO Status (2 minutes)

```bash
# Check 30-day success rate
curl -s 'http://prometheus:9090/api/v1/query?query=sum(rate(routing_requests_total{result="success"}[30d]))/sum(rate(routing_requests_total[30d]))'

# Check error budget remaining
curl -s 'http://prometheus:9090/api/v1/query?query=((1-(sum(rate(routing_requests_total{result="success"}[30d]))/sum(rate(routing_requests_total[30d]))))/0.0005)*100'

# Check burn rate
curl -s 'http://prometheus:9090/api/v1/query?query=(1-(sum(rate(routing_requests_total{result="success"}[1h]))/sum(rate(routing_requests_total[1h]))))/(1-0.9995)'

# View SLO dashboard
# https://grafana.molam.com/d/slo-error-budget
```

**Burn Rate Interpretation:**
- **<1x:** Sustainable (under budget)
- **1-3x:** Moderate concern, monitor closely
- **3-10x:** High concern, investigate and mitigate
- **>10x:** Critical, immediate action required

### 2. Identify Root Cause (5 minutes)

Review recent incidents:

```bash
# Check for active incidents
kubectl get incidents -n molam-routing

# Review recent errors
kubectl logs -l app=routing-service --since=24h | grep ERROR | tail -100

# Check for ongoing alerts
curl -s http://alertmanager:9093/api/v1/alerts | jq '.data[] | select(.status.state=="active")'
```

**Common Root Causes:**
1. **Single major incident:** One outage consuming significant error budget
2. **Multiple small incidents:** Death by a thousand cuts
3. **Dependency degradation:** SIRA, Database, or Redis issues
4. **Code quality issues:** Bugs introduced in recent deployments
5. **Capacity issues:** Insufficient scaling for traffic growth

## Response Procedures

### Phase 1: Immediate Stabilization (0-30 minutes)

**Objective:** Stop error budget burn, restore service to acceptable levels

1. **Acknowledge Alert**
   - Post in #platform-incidents: "SLO violation alert received, investigating"
   - Tag @platform-leadership and @sre-team

2. **Emergency Assessment**
   - Is there an active incident RIGHT NOW?
     - YES → Follow incident-specific runbook
     - NO → Proceed to Phase 2 (historical analysis)

3. **Emergency Mitigation**
   If actively burning error budget (burn rate >10x):
   - Check for recent deployments: rollback if suspicious
   - Check dependency health: SIRA, Database, Redis
   - Scale up if capacity issue
   - Implement circuit breakers if dependency failing

4. **Status Update (15 min mark)**
   Post update in #platform-incidents with:
   - Current burn rate
   - Identified root cause (if known)
   - Mitigation in progress
   - ETA to resolution

### Phase 2: Root Cause Analysis (30 minutes - 2 hours)

**Objective:** Understand what caused the SLO violation

1. **Timeline Construction**
   ```bash
   # Identify when error rate elevated
   # Check Grafana for error rate spike: https://grafana.molam.com/d/routing-overview

   # Get incidents in last 30 days
   kubectl get incidents -n molam-routing --sort-by=.metadata.creationTimestamp
   ```

2. **Categorize Incidents**
   Create spreadsheet with:
   - Date/Time
   - Duration
   - Error count
   - Root cause
   - % of error budget consumed

3. **Analyze Patterns**
   - **Time-based:** Do incidents occur at specific times? (e.g., daily backup jobs)
   - **Deployment-based:** Correlation with releases?
   - **External:** Third-party dependency patterns?
   - **Capacity:** Traffic growth outpacing scaling?

### Phase 3: Recovery Planning (2-24 hours)

**Objective:** Create plan to restore error budget and prevent recurrence

#### Option A: Wait for Natural Recovery
If error budget is only slightly negative and no ongoing issues:
- Monitor for next 30 days
- Error budget will naturally recover as old incidents fall out of 30-day window
- **Timeline:** Up to 30 days

#### Option B: Aggressive Remediation
If significant SLO violation or ongoing issues:

1. **Immediate Fixes (0-7 days)**
   - Fix identified bugs
   - Improve dependency resilience
   - Add circuit breakers / fallbacks
   - Increase monitoring coverage

2. **Medium-term Improvements (1-4 weeks)**
   - Capacity planning and scaling
   - Code quality improvements
   - Chaos engineering to identify weaknesses
   - Load testing

3. **Long-term Investments (1-3 months)**
   - Architecture improvements
   - Redundancy / multi-region
   - Better failure isolation
   - Team training

### Phase 4: Communication & Escalation

#### Internal Communication

1. **Platform Team** (#platform-team)
   - Immediate notification
   - Daily standup updates
   - Post-recovery retrospective

2. **Engineering Leadership**
   - VP Engineering: Notify within 1 hour of SLO violation
   - CTO: Notify if customer-impacting or SLA breach risk

3. **Product/Business**
   - Product Manager: Notify within 2 hours
   - Business Impact Assessment required

#### External Communication

If SLO violation impacts customers or triggers SLA penalties:

1. **Customer Success Team** (#customer-success)
   - Provide impact assessment
   - Support customer communications

2. **Major Merchants**
   - Proactive outreach via Account Managers
   - Transparency about incident and recovery plan

3. **Public Status Page** (status.molam.com)
   - Update if widespread impact
   - Coordinate with Communications team

## Decision Matrix

| Situation | Action | Escalation |
|-----------|--------|-----------|
| Burn rate >10x, active incident | Emergency response, all hands | VP Eng immediately |
| SLO violated, no active incident | Root cause analysis, recovery plan | VP Eng within 1 hour |
| Burn rate 3-10x | Proactive mitigation | Team Lead |
| Burn rate 1-3x | Monitor closely | Team awareness |

## Metrics to Track During Recovery

```bash
# Real-time burn rate (1-hour window)
sum(rate(routing_requests_total{result="success"}[1h]))/sum(rate(routing_requests_total[1h]))

# 30-day success rate trend
sum(rate(routing_requests_total{result="success"}[30d]))/sum(rate(routing_requests_total[30d]))

# Error budget remaining
((1-(sum(rate(routing_requests_total{result="success"}[30d]))/sum(rate(routing_requests_total[30d]))))/0.0005)*100
```

**Recovery Indicators:**
- ✅ Burn rate < 1x for 24 hours
- ✅ No new critical alerts for 48 hours
- ✅ Error budget trend improving
- ✅ Root cause identified and fixed

## Post-Incident Requirements

### 1. Incident Report (Required within 48 hours)

Create detailed incident report including:
- **Timeline:** Minute-by-minute chronology
- **Root Cause:** Technical and organizational factors
- **Impact:** Error budget consumed, customers affected
- **Response:** What went well, what didn't
- **Action Items:** Specific, assigned, with deadlines

**Template:** [Incident Report Template](../postmortems/template.md)

### 2. Postmortem Meeting (Required within 1 week)

Schedule postmortem with:
- Platform Team
- SRE Team
- Engineering Leadership
- Relevant stakeholders

**Agenda:**
- Review incident timeline
- Discuss root cause
- Identify systemic issues
- Assign action items
- Review SLO targets (are they realistic?)

### 3. Follow-up (30 days)

- Review action item completion
- Verify error budget recovery
- Update SLO targets if needed
- Share learnings with broader engineering org

## SLO Adjustment

If SLO violations are frequent despite best efforts, consider:

1. **Relax SLO Target**
   - Change from 99.95% to 99.9%
   - Requires VP Eng approval
   - Communicate to stakeholders

2. **Increase Error Budget**
   - More tolerance for incidents
   - May require customer SLA renegotiation

3. **Change Measurement Window**
   - Shift from 30-day to 7-day window
   - Faster recovery from incidents

**Note:** SLO changes should be data-driven and aligned with business requirements.

## Prevention Strategies

### Technical
- ✅ Comprehensive integration tests
- ✅ Chaos engineering / fault injection
- ✅ Canary deployments
- ✅ Feature flags for quick rollback
- ✅ Dependency circuit breakers
- ✅ Multi-region redundancy

### Operational
- ✅ Regular on-call training
- ✅ Runbook updates and testing
- ✅ Incident response drills
- ✅ Capacity planning reviews
- ✅ Dependency SLA reviews

### Cultural
- ✅ Blameless postmortems
- ✅ Psychological safety
- ✅ Learning from incidents
- ✅ Celebrating reliability wins

## Emergency Contacts

| Role | Contact | Escalation Time |
|------|---------|----------------|
| On-call SRE | #platform-oncall | Immediate |
| Platform Team Lead | @platform-lead | 15 minutes |
| VP Engineering | @vp-engineering | 1 hour |
| CTO | @cto | 2 hours (if customer-impacting) |

---

**Last Updated:** 2025-01-14
**Owner:** SRE Team + Platform Team
**Review Frequency:** Quarterly
