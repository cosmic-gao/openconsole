# Section Definitions

This file defines the rule categories for the **trimmed** Redis best practices set used by this scaffold. Rules are automatically assigned to sections based on their filename prefix.

> Originally 11 sections / 29 rules (Redis Inc.'s upstream set). 4 sections (RQE, Vector, Semantic Caching, Clustering) plus 2 rules (`conn-client-cache`, `json-partial-updates`) were dropped because the scaffold doesn't use those features — see `../AGENTS.md` for the move-out rationale.

---

## 1. Data Structures & Keys (data)
**Impact:** HIGH
**Description:** Choosing the right Redis data type and key naming conventions. Foundation for efficient Redis usage.

## 2. Memory & Expiration (ram)
**Impact:** HIGH
**Description:** Memory limits, eviction policies, TTL strategies, and memory optimization techniques.

## 3. Connection & Performance (conn)
**Impact:** HIGH
**Description:** Connection pooling, pipelining, timeouts, and avoiding blocking commands.

## 4. JSON Documents (json)
**Impact:** MEDIUM
**Description:** Choosing between JSON, Hash, and String for structured data. (The scaffold prefers Hash for flat objects in Node.js — see `json-vs-hash.md`.)

## 5. Streams & Pub/Sub (stream)
**Impact:** MEDIUM
**Description:** Choosing between Streams and Pub/Sub for messaging patterns.

## 6. Security (security)
**Impact:** HIGH
**Description:** Authentication, ACLs, TLS, and network security.

## 7. Observability (observe)
**Impact:** MEDIUM
**Description:** SLOWLOG, INFO, MEMORY commands, monitoring metrics.
