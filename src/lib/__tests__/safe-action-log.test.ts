import { describe, it, expect } from "vitest";
import { describeForLog } from "../safe-action";

describe("describeForLog", () => {
  it("loggt Datenbankfehler nur mit Code und Bezeichnern, ohne detail und message mit Eingabewerten", () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint "patients_user_id_chiffre_key"'), {
      code: "23505",
      constraint: "patients_user_id_chiffre_key",
      table: "patients",
      severity: "ERROR",
      detail: "Key (user_id, chiffre)=(u-1, A-1) already exists.",
    });
    const logged = describeForLog(pgError);
    expect(logged).toMatchObject({ pgCode: "23505", constraint: "patients_user_id_chiffre_key", table: "patients" });
    expect(JSON.stringify(logged)).not.toContain("A-1");
  });

  it("gibt andere Fehler unverändert weiter", () => {
    const error = new Error("kaputt");
    expect(describeForLog(error)).toBe(error);
    const nodeError = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
    expect(describeForLog(nodeError)).toBe(nodeError);
    const epipe = Object.assign(new Error("write"), { code: "EPIPE" });
    expect(describeForLog(epipe)).toBe(epipe);
  });
});
