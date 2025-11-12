# =====================================================================
# Open Policy Agent (OPA) - Authorization Policy for Molam Connect
# =====================================================================
# This policy can be used with Envoy ext_authz for external authorization
# See: https://www.openpolicyagent.org/docs/latest/envoy-introduction/
# =====================================================================

package molam.rbac.authz

import future.keywords.if
import future.keywords.in

# Default deny - fail-closed security model
default allow := false

# =====================================================================
# Main Authorization Decision
# =====================================================================

# Allow if user has required permission
allow if {
    # Get required permission for this endpoint
    required_permission := get_required_permission(input.method, input.path)

    # Check if user has the permission
    has_permission(input.user, required_permission)
}

# Allow if user is a system admin (bypass for ops)
allow if {
    input.user.roles[_] == "system_admin"
}

# =====================================================================
# Permission Mapping (API endpoint -> required permission)
# =====================================================================

# Map HTTP method + path to required permission
get_required_permission(method, path) := permission if {
    method == "GET"
    startswith(path, "/api/connect/payments")
    permission := "connect:payments:read"
}

get_required_permission(method, path) := permission if {
    method == "POST"
    startswith(path, "/api/connect/payments")
    permission := "connect:payments:create"
}

get_required_permission(method, path) := permission if {
    method == "POST"
    contains(path, "/refund")
    permission := "connect:payments:refund"
}

get_required_permission(method, path) := permission if {
    method == "GET"
    startswith(path, "/api/connect/payouts")
    permission := "connect:payouts:read"
}

get_required_permission(method, path) := permission if {
    method == "POST"
    startswith(path, "/api/connect/payouts")
    permission := "connect:payouts:create"
}

get_required_permission(method, path) := permission if {
    method == "GET"
    startswith(path, "/api/rbac/roles")
    permission := "rbac:roles:read"
}

get_required_permission(method, path) := permission if {
    method == "POST"
    startswith(path, "/api/rbac/roles")
    permission := "rbac:roles:create"
}

# Default permission for unknown endpoints
get_required_permission(_, _) := "unknown:endpoint:access"

# =====================================================================
# Permission Checking
# =====================================================================

# Check if user has a specific permission
has_permission(user, permission) if {
    # Check direct grants
    permission in user.permissions
}

has_permission(user, permission) if {
    # Check role-based permissions
    some role in user.roles
    permission in get_role_permissions(role)
}

# =====================================================================
# ABAC (Attribute-Based Access Control)
# =====================================================================

# High-value payments require enhanced KYC
deny["High-value payment requires KYC P2+"] if {
    input.method == "POST"
    contains(input.path, "/payments")
    input.body.amount > 100000
    input.user.kyc_level < "P2"
}

# Payouts to sanctioned countries are blocked
deny["Payouts blocked for sanctioned countries"] if {
    input.method == "POST"
    contains(input.path, "/payouts")
    sanctioned_country := ["KP", "IR", "SY", "CU"]
    input.body.country in sanctioned_country
}

# Refunds require good SIRA score
deny["Refund requires SIRA score > 0.5"] if {
    contains(input.path, "/refund")
    input.user.sira_score < 0.5
}

# =====================================================================
# Role-to-Permissions Mapping (cached from DB)
# =====================================================================

# In production, this would be fetched from Redis/DB
# For demo, we define static mappings
get_role_permissions("connect_owner") := [
    "connect:payments:read",
    "connect:payments:create",
    "connect:payments:refund",
    "connect:payouts:read",
    "connect:payouts:create",
    "rbac:roles:read",
    "rbac:roles:create",
]

get_role_permissions("connect_finance") := [
    "connect:payments:read",
    "connect:payments:refund",
    "connect:payouts:read",
    "connect:payouts:create",
]

get_role_permissions("connect_ops") := [
    "connect:payments:read",
    "connect:payouts:read",
]

get_role_permissions("connect_developer") := [
    "connect:payments:read",
    "connect:payouts:read",
]

# Default: no permissions
get_role_permissions(_) := []

# =====================================================================
# Context-Based Access (ABAC)
# =====================================================================

# Allow access only within user's country scope
allow_by_country if {
    input.resource.country == input.user.country
}

# Allow access only within user's currency scope
allow_by_currency if {
    input.resource.currency == input.user.currency
}

# Allow access only within user's organisation
allow_by_organisation if {
    input.resource.organisation_id == input.user.organisation_id
}

# =====================================================================
# Audit Logging
# =====================================================================

# Generate audit log for denied requests
audit_log := {
    "timestamp": time.now_ns(),
    "user": input.user.id,
    "action": input.method,
    "resource": input.path,
    "decision": "deny",
    "reasons": deny,
} if {
    count(deny) > 0
}

# Generate audit log for allowed requests
audit_log := {
    "timestamp": time.now_ns(),
    "user": input.user.id,
    "action": input.method,
    "resource": input.path,
    "decision": "allow",
} if {
    allow
}