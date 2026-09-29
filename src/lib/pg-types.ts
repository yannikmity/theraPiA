import pg from "pg";

// DATE (OID 1082) als rohen YYYY-MM-DD-String lesen: pg macht sonst lokale Mitternacht daraus,
// und toISOString() verschiebt das Datum in Zeitzonen östlich von UTC auf den Vortag.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

// NUMERIC/DECIMAL (OID 1700) als JS-Zahl lesen: pg liefert sonst einen String, der an z.number()-Schemas
// scheitert und bei `+` verkettet statt addiert. Die Spalten sind Stundensätze (Geld pro Stunde) und
// Durchschnitte (avg_kids) – float-Genauigkeit reicht dafür. NULL bleibt null (pg ruft den Parser nur für Nicht-NULL).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => parseFloat(value));
