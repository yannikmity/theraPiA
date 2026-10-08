import type { ReactNode } from "react";
import type { Nachweis, NachweisTotals } from "@/lib/nachweis";
import { CATEGORY_LABELS, SUPERVISION_KIND_LABELS, SUPERVISION_SETTING_LABELS, sichtbareKategorien } from "@/lib/labels";
import { formatDecimal } from "@/lib/csv";
import { UNIT_MINUTES } from "@/lib/constants";
import { REGEL_LABELS, formatRegelwert, type Ausbildungsregeln, type RegelFeld } from "@/lib/ausbildungsregeln/model";
import { formatDateDe } from "@/lib/dates";
import { countNoun, formatVerhaeltnis } from "@/lib/format";
import { cn } from "@/lib/utils";

// Der Nachweis zum Ausdrucken und Unterschreiben: reine Darstellung des Sichtmodells aus buildNachweis, ohne Hooks
// (rendert auf dem Server). Bildschirm und Druck teilen dasselbe Markup; Druckregeln über print:-Varianten,
// die A4-Seite über @page in globals.css. Notizen erscheinen nie – buildNachweis liefert sie nicht.
const TH = "py-1.5 pr-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase print:py-1 print:text-[9pt] print:text-foreground";
const TD = "py-1.5 pr-3 align-top text-sm print:py-1 print:text-[10pt]";
// break-inside-avoid: keine Tabellenzeile über einen Seitenumbruch.
const ROW = "border-b border-border break-inside-avoid";
const DT = "text-muted-foreground print:text-foreground";

// Fußzeile jeder gedruckten Seite als @page-Randbox: Name, Zeitraum, „Seite X von Y“ (#47). Chromium (auch Edge) druckt
// Randboxen mit counter(page)/counter(pages) seit Version 131; Safari und Firefox kennen sie nicht und drucken ohne
// Fußzeile – das Dokument bleibt gleich. Der Text ist eine CSS-Zeichenkette aus Nutzereingaben (Name): cssString escapt
// Anführungszeichen, Backslash, Zeilenumbrüche (CR, LF, Seitenvorschub), NUL und die HTML-Sonderzeichen als Hex-Escapes,
// damit weder die Zeichenkette noch das <style>-Element vorzeitig enden (\0 ersetzt CSS durch U+FFFD – gewollt).
// Die Randbox erbt von :root, deshalb funktioniert var(--foreground).
export function cssString(value: string): string {
  return `"${value.replace(/[\\"<>&\r\n\f\0]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;
}

export function printFooterCss(text: string): string {
  return `@page { @bottom-center { content: ${cssString(text)} " · Seite " counter(page) " von " counter(pages); font: 9pt system-ui, sans-serif; color: var(--foreground); } }`;
}

const minutes = (value: number) => `${value} Min`;
const count = (n: number, singular: string, plural: string) => countNoun(n, singular, plural);

function Section({ id, title, count, children }: { id: string; title: string; count?: number; children: ReactNode }) {
  const headingId = `nachweis-${id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2 print:space-y-1">
      <h3 id={headingId} className="text-sm font-semibold text-foreground print:text-[11pt]">
        {count === undefined ? title : `${title} (${count})`}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground print:text-[10pt]">{children}</p>;
}

function Table({ head, label, children }: { head: string[]; label: string; children: ReactNode }) {
  // Am Handy scrollt die Tabelle waagerecht in ihrem Container statt die ganze Seite; gedruckt bleibt alles sichtbar.
  // tabIndex 0 + Name: der Scroll-Container ist per Tastatur erreichbar und mit den Pfeiltasten scrollbar (#47) –
  // ein zusätzlicher Tab-Stopp auch ohne Überlauf, dafür ohne Skript.
  // Im Druck kein Ring (print:ring-0!, #56) – mit !, weil focus-visible:ring-[3px] als Pseudoklasse spezifischer ist.
  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={`Tabelle ${label}`}
      className="overflow-x-auto rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring print:overflow-visible print:ring-0!"
    >
      <table className="w-full border-collapse">
        {/* table-header-group: Chromium wiederholt den Tabellenkopf auf jeder gedruckten Seite. */}
        <thead className="table-header-group">
          <tr className={ROW}>
            {head.map((label) => (
              <th key={label} scope="col" className={cn(TH, label === "Dauer" && "text-right")}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function supervisionRefs(refs: { date: string; supervisorName: string }[]): string {
  return refs.length === 0 ? "–" : refs.map((r) => `${formatDateDe(r.date)} (${r.supervisorName})`).join(", ");
}

// Persönliche Regeln (#8) stehen im Dokument, weil es unterschrieben wird – wer es liest, muss wissen, welches Soll galt.
function Totals({ totals, regeln, abweichend }: { totals: NachweisTotals; regeln: Ausbildungsregeln; abweichend: RegelFeld[] }) {
  const ratio = totals.ratio.ratio;
  return (
    <div className="space-y-2">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 print:grid-cols-2 print:text-[10pt]">
        <div>
          <dt className={DT}>Therapiesitzungen</dt>
          <dd>
            {count(totals.therapyUnits, "Sitzung", "Sitzungen")}, {formatDecimal(totals.therapyHours)} Behandlungsstunden
            <span className="block text-xs text-muted-foreground print:text-[9pt] print:text-foreground">
              davon{" "}
              {sichtbareKategorien(totals.hoursByCategory)
                .map((c) => `${CATEGORY_LABELS[c]} ${formatDecimal(totals.hoursByCategory[c])}`)
                .join(", ")}
            </span>
          </dd>
        </div>
        <div>
          <dt className={DT}>Supervisionen</dt>
          <dd>
            {count(totals.supervisionUnits, "Supervision", "Supervisionen")}, {formatDecimal(totals.supervisionHours)} SV-Einheiten
          </dd>
        </div>
        <div>
          <dt className={DT}>Doppelstunden (Gruppe)</dt>
          <dd>
            {count(totals.groupSessionUnits, "Doppelstunde", "Doppelstunden")}, {formatDecimal(totals.groupSessionHours)}{" "}
            Einheiten à {UNIT_MINUTES} Min
          </dd>
        </div>
        <div>
          <dt className={DT}>Verhältnis Supervision : Therapie</dt>
          <dd>
            {ratio === Infinity
              ? "– (keine Supervision im Zeitraum)"
              : totals.therapyMinutes === 0
                ? "– (keine Therapiesitzungen)"
                : `1 : ${formatDecimal(ratio, 1)}`}
            <span className="block text-xs text-muted-foreground print:text-[9pt] print:text-foreground">{`Soll: 1 : ${formatVerhaeltnis(regeln.verhaeltnisWarnung)}`}</span>
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground print:text-[9pt] print:text-foreground">
        Behandlungsstunden und SV-Einheiten zählen zu je {UNIT_MINUTES} Minuten. Doppelstunden (Gruppe) werden gesondert
        gezählt und nicht auf die {regeln.behandlungsstundenZiel} Behandlungsstunden angerechnet. Die Listen nennen die Dauer in Minuten.
      </p>
      {abweichend.length > 0 && (
        <p data-regeln-persoenlich="" className="text-xs text-muted-foreground print:text-[9pt] print:text-foreground">
          {`Es gelten persönlich festgelegte Ausbildungsregeln: ${abweichend
            .map((feld) => `${REGEL_LABELS[feld]} ${formatRegelwert(feld, regeln[feld])}`)
            .join(", ")}.`}
        </p>
      )}
    </div>
  );
}

// pt-12 (48 px ≈ 12,7 mm im Druck): Platz zum Unterschreiben über der Linie.
function SignatureField({ label, name }: { label: string; name?: string }) {
  return (
    <div className="pt-10 print:pt-12">
      <div className="border-t border-foreground pt-1 text-xs text-muted-foreground print:text-[9pt] print:text-foreground">
        <p>{label}</p>
        {name && <p className="text-foreground">{name}</p>}
      </div>
    </div>
  );
}

export function NachweisDocument({ nachweis }: { nachweis: Nachweis }) {
  const { pia, period, supervisor, totals } = nachweis;
  const footer = `Ausbildungsnachweis ${pia.name} · ${formatDateDe(period.from)} – ${formatDateDe(period.to)}`;
  return (
    <article aria-labelledby="nachweis-titel" data-nachweis-document="" className="space-y-6 text-foreground print:space-y-4">
      <style dangerouslySetInnerHTML={{ __html: printFooterCss(footer) }} />
      <header className="space-y-2">
        <h2 id="nachweis-titel" className="text-xl font-semibold print:text-[16pt]">
          Ausbildungsnachweis
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm print:text-[10pt]">
          <dt className={DT}>Name der PiA</dt>
          <dd>{pia.name}</dd>
          <dt className={DT}>E-Mail</dt>
          <dd>{pia.email}</dd>
          <dt className={DT}>Zeitraum</dt>
          <dd>{`${formatDateDe(period.from)} – ${formatDateDe(period.to)}`}</dd>
          {supervisor && (
            <>
              <dt className={DT}>Supervisor:in</dt>
              <dd>{supervisor.name}</dd>
            </>
          )}
          <dt className={DT}>Erstellt am</dt>
          <dd>{formatDateDe(nachweis.generatedAt)}</dd>
        </dl>
        {supervisor && (
          <p className="text-xs text-muted-foreground print:text-[9pt] print:text-foreground">
            Enthält die Supervisionen dieser Supervisor:in im Zeitraum und alle darin besprochenen Sitzungen und Doppelstunden –
            auch wenn deren eigenes Datum außerhalb des Zeitraums liegt.
          </p>
        )}
      </header>

      <Section id="therapie" title="Therapiesitzungen" count={nachweis.therapySessions.length}>
        {nachweis.therapySessions.length === 0 ? (
          <Empty>Keine Therapiesitzungen im Zeitraum.</Empty>
        ) : (
          <Table label="Therapiesitzungen" head={["Datum", "Chiffre", "Kategorie", "Dauer", "Supervision am"]}>
            {nachweis.therapySessions.map((s) => (
              <tr key={s.id} className={ROW}>
                <td className={cn(TD, "whitespace-nowrap")}>{formatDateDe(s.date)}</td>
                <td className={cn(TD, "font-mono")}>{s.chiffre}</td>
                <td className={TD}>{CATEGORY_LABELS[s.category]}</td>
                <td className={cn(TD, "text-right whitespace-nowrap tabular-nums")}>{minutes(s.durationMinutes)}</td>
                <td className={TD}>{supervisionRefs(s.supervisions)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section id="supervision" title="Supervisionen" count={nachweis.supervisionSessions.length}>
        {nachweis.supervisionSessions.length === 0 ? (
          <Empty>Keine Supervisionen im Zeitraum.</Empty>
        ) : (
          <Table label="Supervisionen" head={["Datum", "Supervisor:in", "Art", "Setting", "Dauer", "Besprochene Sitzungen"]}>
            {nachweis.supervisionSessions.map((sv) => {
              const discussed = [
                ...sv.linkedTherapySessions.map((t) => `${t.chiffre} (${formatDateDe(t.date)})`),
                ...sv.linkedGroupSessions.map((g) => `${g.groupName} (${formatDateDe(g.date)})`),
              ];
              return (
                <tr key={sv.id} className={ROW}>
                  <td className={cn(TD, "whitespace-nowrap")}>{formatDateDe(sv.date)}</td>
                  <td className={cn(TD, "whitespace-nowrap")}>{sv.supervisorName}</td>
                  <td className={TD}>{SUPERVISION_KIND_LABELS[sv.kind]}</td>
                  <td className={TD}>{SUPERVISION_SETTING_LABELS[sv.setting]}</td>
                  <td className={cn(TD, "text-right whitespace-nowrap tabular-nums")}>
                    {minutes(sv.durationMinutes)}
                    {/* Aufteilung nur bei mehreren Fällen (#40). */}
                    {sv.caseShares.length > 1 &&
                      sv.caseShares.map((c) => (
                        <span key={c.chiffre} className="block text-xs text-muted-foreground print:text-[9pt] print:text-foreground">
                          {c.chiffre}: {minutes(c.minutes)}
                        </span>
                      ))}
                  </td>
                  <td className={TD}>{discussed.length === 0 ? "–" : discussed.join(", ")}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section id="gruppen" title="Doppelstunden" count={nachweis.groupSessions.length}>
        {nachweis.groupSessions.length === 0 ? (
          <Empty>Keine Doppelstunden im Zeitraum.</Empty>
        ) : (
          <Table label="Doppelstunden" head={["Datum", "Gruppe", "Teilnehmende", "Ambulanzzeit", "Dauer", "Supervision am"]}>
            {nachweis.groupSessions.map((g) => (
              <tr key={g.id} className={ROW}>
                <td className={cn(TD, "whitespace-nowrap")}>{formatDateDe(g.date)}</td>
                <td className={TD}>{g.groupName}</td>
                <td className={cn(TD, "tabular-nums")}>{g.childCount ?? "–"}</td>
                <td className={TD}>{g.countsTowardAmbulanzzeit ? "ja" : "nein"}</td>
                <td className={cn(TD, "text-right whitespace-nowrap tabular-nums")}>{minutes(g.durationMinutes)}</td>
                <td className={TD}>{supervisionRefs(g.supervisions)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Summen und Unterschriften als ein Block ohne Seitenumbruch: Die Unterschriften stehen nie allein auf einer
          Seite, getrennt von dem, was sie bestätigen – reicht der Platz nicht, wandern beide gemeinsam auf die nächste. */}
      <div className="space-y-6 break-inside-avoid print:space-y-4">
        <Section id="summen" title="Summen">
          <Totals totals={totals} regeln={nachweis.regeln} abweichend={nachweis.abweichend} />
        </Section>

        <section aria-label="Unterschriften" className="grid grid-cols-1 gap-8 pt-6 sm:grid-cols-3 print:grid-cols-3 print:pt-0">
          <SignatureField label="Ort, Datum" />
          <SignatureField label="Unterschrift PiA" name={pia.name} />
          {supervisor ? (
            <SignatureField label="Unterschrift Supervisor:in" name={supervisor.name} />
          ) : (
            <SignatureField label="Unterschrift Institut/Ambulanz" />
          )}
        </section>
      </div>
    </article>
  );
}
