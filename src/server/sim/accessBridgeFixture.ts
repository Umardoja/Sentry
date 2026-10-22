import "server-only";
import type Database from "better-sqlite3";

/** Small, deterministic fixture for the local Access Bridge walkthrough. */
export function seedAccessBridgeFixture(db: Database.Database): void {
  db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO staff
      (id,name,pseudo_id,role,team,branch,employment_type,phone,usual_terminal_ids,declared_scope)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      "STF-ACCESS-OWNER", "Amaka N.", "Staff-C2A1", "CUSTOMER_SERVICE", "CUSTOMER_CARE", "Cedar",
      "EMPLOYEE", "08000000199", JSON.stringify(["TRM-ACCESS-OWNER"]), null,
    );
    db.prepare(`INSERT OR IGNORE INTO customers
      (id,name,phone,bvn_hash,is_dormant,city) VALUES (?,?,?,?,?,?)`).run(
      "CUS-ACCESS-001", "Sample Customer 8421", "080000008421", "BVN-SAMPLE-ACCESS", 0, "Lagos",
    );
    db.prepare(`INSERT OR IGNORE INTO tickets
      (id,type,customer_id,transaction_id,assigned_team,created_by_staff_id,approved_by_staff_id,created_at,status,scope)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      "TKT-ACCESS-1016", "COMPLAINT", "CUS-ACCESS-001", null, "CUSTOMER_CARE", "STF-ACCESS-OWNER", "STF-0007",
      "2026-10-16T19:45:00+01:00", "OPEN", "VIEW_RESTRICTION_STATUS",
    );
    db.prepare(`INSERT OR IGNORE INTO leave
      (id,staff_id,start_date,end_date,status) VALUES (?,?,?,?,?)`).run(
      "LEV-ACCESS-OWNER", "STF-ACCESS-OWNER", "2026-10-16", "2026-10-16", "APPROVED",
    );
    db.prepare(`INSERT OR IGNORE INTO access_cases
      (id,ticket_id,customer_id,owner_staff_id,assigned_staff_id,assigned_team,status,sensitivity,evidence_status,customer_ref,restriction_summary,created_at,completed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(
      "ACCESS-0001", "TKT-ACCESS-1016", "CUS-ACCESS-001", "STF-ACCESS-OWNER", "STF-0101", "CUSTOMER_CARE",
      "OPEN", "LOW", "VERIFIED", "Customer ••••8421",
      "Outgoing transfers are temporarily restricted while the sample complaint is reviewed.",
      "2026-10-16T20:15:00+01:00",
    );
    db.prepare(`INSERT OR IGNORE INTO case_coverage_delegations
      (id,case_id,owner_staff_id,substitute_staff_id,approved_by_staff_id,status,starts_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      "COV-ACCESS-0001", "ACCESS-0001", "STF-ACCESS-OWNER", "STF-0101", "STF-0007", "ACTIVE",
      "2026-10-16T20:00:00+01:00", "2026-10-16T23:00:00+01:00",
    );
    db.prepare(`INSERT OR IGNORE INTO access_eligibility
      (id,staff_id,operation,resource_scope,status,approved_by_staff_id,approved_at)
      VALUES (?,?,?,?,?,?,?)`).run(
      "ELIG-ACCESS-0001", "STF-0101", "VIEW_RESTRICTION_STATUS", "CASE_CUSTOMER", "ACTIVE", "STF-0007",
      "2026-10-16T18:30:00+01:00",
    );
  })();
}
