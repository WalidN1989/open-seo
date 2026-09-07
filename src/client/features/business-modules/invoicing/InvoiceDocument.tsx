import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import type { getInvoice } from "@/serverFunctions/invoicing";

type InvoiceDetail = Awaited<ReturnType<typeof getInvoice>>;

function Lines({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      {value
        .split("\n")
        .filter((line) => line.trim())
        .map((line, index) => (
          <div key={index}>{line}</div>
        ))}
    </>
  );
}

function longDate(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function quantityLabel(quantityMilli: number) {
  const value = quantityMilli / 1000;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * The printable document.
 *
 * Deliberately plain: black on white, one accent-free table, generous space.
 * Styling lives in inline styles rather than app theme tokens because this is
 * printed and emailed — it must look the same on a page as on a dark screen.
 */
export function InvoiceDocument({ detail }: { detail: InvoiceDetail }) {
  const { invoice, issuer, lines, heading } = detail;
  const money = (minor: number) => formatMoney(minor, invoice.currency);

  return (
    <div className="invoice-document" data-invoice-document>
      <header className="invoice-top">
        <div>
          <h1 className="invoice-heading">{heading}</h1>
          <dl className="invoice-meta">
            <dt>Invoice number</dt>
            <dd>{invoice.number}</dd>
            <dt>Date of issue</dt>
            <dd>{longDate(invoice.issueDate)}</dd>
            <dt>Date due</dt>
            <dd>{longDate(invoice.dueDate)}</dd>
            {issuer.taxIdValue ? (
              <>
                <dt>{issuer.taxIdLabel ?? "Registration"}</dt>
                <dd>{issuer.taxIdValue}</dd>
              </>
            ) : null}
          </dl>
        </div>
        {issuer.logoUrl ? (
          <img className="invoice-logo" src={issuer.logoUrl} alt="" />
        ) : (
          <div className="invoice-wordmark">{issuer.legalName}</div>
        )}
      </header>

      <section className="invoice-parties">
        <div>
          <p className="invoice-party-name">{issuer.legalName}</p>
          <Lines value={issuer.addressLines} />
          {issuer.email ? <div>{issuer.email}</div> : null}
          {issuer.phone ? <div>{issuer.phone}</div> : null}
        </div>
        <div>
          <p className="invoice-party-label">Bill to</p>
          <p className="invoice-party-name">{invoice.clientName}</p>
          <Lines value={invoice.clientAddressLines} />
          {invoice.clientTaxIdValue ? (
            <div>
              {invoice.clientTaxIdLabel ?? "ABN"} {invoice.clientTaxIdValue}
            </div>
          ) : null}
          {invoice.clientEmail ? <div>{invoice.clientEmail}</div> : null}
        </div>
      </section>

      <p className="invoice-amount-due">
        {money(invoice.totalMinor)} {invoice.currency} due{" "}
        {longDate(invoice.dueDate)}
      </p>
      {invoice.servicePeriod ? (
        <p className="invoice-period">{invoice.servicePeriod}</p>
      ) : null}

      <table className="invoice-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Unit price</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>
                <div>{line.description}</div>
                {line.detail ? (
                  <div className="invoice-line-detail">
                    <Lines value={line.detail} />
                  </div>
                ) : null}
              </td>
              <td className="num">{quantityLabel(line.quantityMilli)}</td>
              <td className="num">{money(line.unitPriceMinor)}</td>
              <td className="num">{money(line.amountMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-totals">
        <div>
          <span>Subtotal</span>
          <span>{money(invoice.subtotalMinor)}</span>
        </div>
        {invoice.taxRatePercent > 0 ? (
          <div>
            <span>
              {invoice.taxLabel ?? "Tax"} ({invoice.taxRatePercent}%)
            </span>
            <span>{money(invoice.taxMinor)}</span>
          </div>
        ) : null}
        <div className="invoice-total-row">
          <span>Amount due</span>
          <span>
            {money(invoice.totalMinor)} {invoice.currency}
          </span>
        </div>
      </div>

      {issuer.bankDetails || issuer.paymentInstructions ? (
        <section className="invoice-payment">
          <p className="invoice-party-label">How to pay</p>
          <Lines value={issuer.paymentInstructions} />
          <Lines value={issuer.bankDetails} />
        </section>
      ) : null}

      {invoice.notes ? (
        <section className="invoice-notes">
          <Lines value={invoice.notes} />
        </section>
      ) : null}

      <footer className="invoice-footer">
        {/* An unregistered issuer says so plainly, so nobody tries to claim a
            tax credit that does not exist. */}
        {!issuer.taxRegistered ? <div>{issuer.taxNote ?? "No GST has been charged."}</div> : null}
        {issuer.footerNote ? <Lines value={issuer.footerNote} /> : null}
      </footer>
    </div>
  );
}
