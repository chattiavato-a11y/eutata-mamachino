// src/debug/storage.js
// Storage self-test for KV + R2 + D1 with diagnostic codes.

// Legend (quick view):
//   S-OK        → All 3 (KV, R2, D1) are working ("SYNC").
//   S-PARTIAL   → Some work, some fail.
//   S-FAIL      → None of KV/R2/D1 work.
//
//   K-OK        → KV reachable and read/write OK.
//   K-01        → KV binding missing (wrangler.toml or dashboard).
//   K-02        → KV put/get mismatch or readback failed.
//
//   R-OK        → R2 reachable and read/write OK.
//   R-01        → R2 binding missing.
//   R-02        → R2 put/get mismatch or readback failed.
//
//   D-OK        → D1 reachable and simple SELECT works.
//   D-01        → D1 binding missing.
//   D-02        → D1 query failed (SQL or DB not initialized).
//   D-03        → D1 returned unexpected row (no { ok: 1 }).

export async function debugStorage(env) {
  const result = {
    status: "UNKNOWN",      // "SYNC" | "PARTIAL" | "FAIL"
    summaryCode: "S-UNKNOWN",
    kv: {
      ok: false,
      binding: "OPS_TRANSCRIPTS_KV",
      error: null,
      code: null            // "K-OK", "K-01", "K-02"
    },
    r2: {
      ok: false,
      binding: "OPS_ARTIFACTS_R2",
      error: null,
      code: null            // "R-OK", "R-01", "R-02"
    },
    d1: {
      ok: false,
      binding: "OPS_TRAINING_DB",
      error: null,
      code: null,           // "D-OK", "D-01", "D-02", "D-03"
      row: null
    },
    diagnostics: []          // [{ code, area, message }]
  };

  function pushDiag(code, area, message) {
    result.diagnostics.push({ code, area, message });
  }

  /* ------------------------- KV: OPS_TRANSCRIPTS_KV ------------------------- */
  try {
    if (!env.OPS_TRANSCRIPTS_KV) {
      result.kv.ok = false;
      result.kv.code = "K-01";
      result.kv.error = "OPS_TRANSCRIPTS_KV binding missing in environment";
      pushDiag(
        "K-01",
        "KV",
        "OPS_TRANSCRIPTS_KV is not bound. Check wrangler.toml kv_namespaces and the KV namespace ID."
      );
    } else {
      const key = "debug:kv:test";
      await env.OPS_TRANSCRIPTS_KV.put(key, "ok", { expirationTtl: 600 });
      const value = await env.OPS_TRANSCRIPTS_KV.get(key);
      if (value === "ok") {
        result.kv.ok = true;
        result.kv.code = "K-OK";
        pushDiag("K-OK", "KV", "OPS_TRANSCRIPTS_KV reachable and read/write succeeded.");
      } else {
        result.kv.ok = false;
        result.kv.code = "K-02";
        result.kv.error = `Expected "ok", got: ${String(value)}`;
        pushDiag(
          "K-02",
          "KV",
          `OPS_TRANSCRIPTS_KV read/write mismatch. Expected "ok", got "${String(value)}".`
        );
      }
    }
  } catch (err) {
    result.kv.ok = false;
    result.kv.code = result.kv.code || "K-02";
    result.kv.error = String(err);
    pushDiag(
      result.kv.code,
      "KV",
      `Exception while testing OPS_TRANSCRIPTS_KV: ${String(err)}`
    );
  }

  /* -------------------------- R2: OPS_ARTIFACTS_R2 ------------------------- */
  try {
    if (!env.OPS_ARTIFACTS_R2) {
      result.r2.ok = false;
      result.r2.code = "R-01";
      result.r2.error = "OPS_ARTIFACTS_R2 binding missing in environment";
      pushDiag(
        "R-01",
        "R2",
        "OPS_ARTIFACTS_R2 is not bound. Check wrangler.toml r2_buckets and the bucket name."
      );
    } else {
      const objectName = "debug-storage-test.txt";
      await env.OPS_ARTIFACTS_R2.put(objectName, "ok");
      const obj = await env.OPS_ARTIFACTS_R2.get(objectName);
      if (!obj) {
        result.r2.ok = false;
        result.r2.code = "R-02";
        result.r2.error = "Object not found after put()";
        pushDiag(
          "R-02",
          "R2",
          "OPS_ARTIFACTS_R2 did not return the object after put()."
        );
      } else {
        const text = await obj.text();
        if (text === "ok") {
          result.r2.ok = true;
          result.r2.code = "R-OK";
          pushDiag("R-OK", "R2", "OPS_ARTIFACTS_R2 reachable and read/write succeeded.");
        } else {
          result.r2.ok = false;
          result.r2.code = "R-02";
          result.r2.error = `Expected "ok", got: ${String(text)}`;
          pushDiag(
            "R-02",
            "R2",
            `OPS_ARTIFACTS_R2 read/write mismatch. Expected "ok", got "${String(text)}".`
          );
        }
      }
    }
  } catch (err) {
    result.r2.ok = false;
    result.r2.code = result.r2.code || "R-02";
    result.r2.error = String(err);
    pushDiag(
      result.r2.code,
      "R2",
      `Exception while testing OPS_ARTIFACTS_R2: ${String(err)}`
    );
  }

  /* -------------------------- D1: OPS_TRAINING_DB -------------------------- */
  try {
    if (!env.OPS_TRAINING_DB) {
      result.d1.ok = false;
      result.d1.code = "D-01";
      result.d1.error = "OPS_TRAINING_DB binding missing in environment";
      pushDiag(
        "D-01",
        "D1",
        "OPS_TRAINING_DB is not bound. Check wrangler.toml d1_databases and the database binding."
      );
    } else {
      let row = null;
      try {
        row = await env.OPS_TRAINING_DB
          .prepare("SELECT 1 AS ok")
          .first();
      } catch (inner) {
        result.d1.ok = false;
        result.d1.code = "D-02";
        result.d1.error = `Query failed: ${String(inner)}`;
        result.d1.row = null;
        pushDiag(
          "D-02",
          "D1",
          `Failed to run "SELECT 1 AS ok" on OPS_TRAINING_DB: ${String(inner)}`
        );
      }

      if (row) {
        result.d1.row = row;
        if (row.ok === 1 || row.OK === 1) {
          result.d1.ok = true;
          result.d1.code = "D-OK";
          pushDiag("D-OK", "D1", "OPS_TRAINING_DB reachable and basic SELECT succeeded.");
        } else if (!result.d1.code) {
          result.d1.ok = false;
          result.d1.code = "D-03";
          result.d1.error = `Unexpected row: ${JSON.stringify(row)}`;
          pushDiag(
            "D-03",
            "D1",
            `OPS_TRAINING_DB returned unexpected row for SELECT 1 AS ok: ${JSON.stringify(row)}`
          );
        }
      } else if (!result.d1.code) {
        // No row and no inner error code set.
        result.d1.ok = false;
        result.d1.code = "D-02";
        result.d1.error = "No row returned from SELECT 1 AS ok";
        pushDiag(
          "D-02",
          "D1",
          "No row returned from SELECT 1 AS ok on OPS_TRAINING_DB."
        );
      }
    }
  } catch (err) {
    result.d1.ok = false;
    result.d1.code = result.d1.code || "D-02";
    result.d1.error = String(err);
    pushDiag(
      result.d1.code,
      "D1",
      `Exception while testing OPS_TRAINING_DB: ${String(err)}`
    );
  }

  /* ------------------------------ Overall status --------------------------- */
  const okCount = [result.kv.ok, result.r2.ok, result.d1.ok].filter(Boolean).length;

  if (okCount === 3) {
    result.status = "SYNC";
    result.summaryCode = "S-OK";
    pushDiag("S-OK", "SUMMARY", "All storage bindings (KV, R2, D1) are in sync and working.");
  } else if (okCount > 0) {
    result.status = "PARTIAL";
    result.summaryCode = "S-PARTIAL";
    pushDiag("S-PARTIAL", "SUMMARY", "Some storage bindings work, some have errors.");
  } else {
    result.status = "FAIL";
    result.summaryCode = "S-FAIL";
    pushDiag("S-FAIL", "SUMMARY", "None of KV, R2, or D1 are responding correctly.");
  }

  return result;
}
