export interface CardDetails {
  cardHolder: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
}

function formatCardNumber(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

/** Fake card form (test mode) shared between company registration and subscription management. */
export function CardPaymentFields({
  value,
  onChange,
}: {
  value: CardDetails;
  onChange: (patch: Partial<CardDetails>) => void;
}) {
  return (
    <>
      <div className="alert alert--info">
        Test mode — this is a payment simulator, no real charge occurs. Use a card number like{' '}
        <strong>4242 4242 4242 4242</strong> for a successful payment, or one ending in{' '}
        <strong>0002</strong> / <strong>9995</strong> to see how a decline is handled.
      </div>

      <label className="field">
        <span>Cardholder name</span>
        <input value={value.cardHolder} onChange={(e) => onChange({ cardHolder: e.target.value })} required />
      </label>
      <label className="field">
        <span>Card number</span>
        <input
          value={value.cardNumber}
          onChange={(e) => onChange({ cardNumber: formatCardNumber(e.target.value) })}
          placeholder="4242 4242 4242 4242"
          inputMode="numeric"
          required
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Expiry (MM/YY)</span>
          <input
            value={value.cardExpiry}
            onChange={(e) => onChange({ cardExpiry: formatExpiry(e.target.value) })}
            placeholder="12/28"
            inputMode="numeric"
            required
          />
        </label>
        <label className="field">
          <span>CVV</span>
          <input
            value={value.cardCvv}
            onChange={(e) => onChange({ cardCvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            placeholder="123"
            inputMode="numeric"
            required
          />
        </label>
      </div>
    </>
  );
}
