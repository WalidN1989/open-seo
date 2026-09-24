import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import { companyFooterLines, yearOf } from "@/shared/company-footer";
import { Lines, longDate, quantityLabel } from "../invoicing/documentParts";
import type { QuoteDetailData } from "./quotesQuery";

/**
 * The printable quote. Same page as the invoice — black on white, one table,
 * print-safe styles — so a client who later receives the invoice sees the
 * same business, laid out the same way.
 */
export function QuoteDocument({ detail }: { detail: QuoteDetailData }) {
  const { quote, issuer, lines, heading } = detail;
  const money = (minor: number) => formatMoney(minor, quote.currency);

  return (
    <div className="invoice-document" data-invoice-document>
      <header className="invoice-top">
        <div>
          <h1 className="invoice-heading">{heading}</h1>
          <dl className="invoice-meta">
            <dt>Quote number</dt>
            <dd>{quote.number}</dd>
            <dt>Date</dt>
            <dd>{longDate(quote.issueDate)}</dd>
            <dt>Valid until</dt>
            <dd>{longDate(quote.validUntil)}</dd>
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
          <p className="invoice-party-label">Prepared for</p>
          <p className="invoice-party-name">{quote.clientName}</p>
          <Lines value={quote.clientAddressLines} />
          {quote.clientTaxIdValue ? (
            <div>
              {quote.clientTaxIdLabel ?? "ABN"} {quote.clientTaxIdValue}
            </div>
          ) : null}
          {quote.clientEmail ? <div>{quote.clientEmail}</div> : null}
        </div>
      </section>

      <p className="invoice-amount-due">
        {money(quote.totalMinor)} {quote.currency}
      </p>
      {quote.title ? <p className="invoice-period">{quote.title}</p> : null}

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
          <span>{money(quote.subtotalMinor)}</span>
        </div>
        {quote.taxRatePercent > 0 ? (
          <div>
            <span>
              {quote.taxLabel ?? "Tax"} ({quote.taxRatePercent}%)
            </span>
            <span>{money(quote.taxMinor)}</span>
          </div>
        ) : null}
        <div className="invoice-total-row">
          <span>Total</span>
          <span>
            {money(quote.totalMinor)} {quote.currency}
          </span>
        </div>
      </div>

      {quote.terms ? (
        <section className="invoice-payment">
          <p className="invoice-party-label">Terms</p>
          <Lines value={quote.terms} />
        </section>
      ) : null}

      {quote.notes ? (
        <section className="invoice-notes">
          <Lines value={quote.notes} />
        </section>
      ) : null}

      <footer className="invoice-footer">
        <div>
          This quote is valid until {longDate(quote.validUntil)}. Prices may
          change after that date.
        </div>
        {!issuer.taxRegistered ? (
          <div>{issuer.taxNote ?? "No GST is included."}</div>
        ) : null}
        {issuer.footerNote ? <Lines value={issuer.footerNote} /> : null}
        <div className="mt-3">
          {companyFooterLines(issuer, yearOf(quote.issueDate)).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </footer>
    </div>
  );
}
