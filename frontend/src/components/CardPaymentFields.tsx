import { useLanguage } from '@/i18n/useLanguage';

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
  const { t } = useLanguage();
  return (
    <>
      <div className="alert alert--info">
        {t.cardPayment.testModePrefix} <strong>4242 4242 4242 4242</strong> {t.cardPayment.testModeMiddle}{' '}
        <strong>0002</strong> {t.cardPayment.testModeOr} <strong>9995</strong> {t.cardPayment.testModeSuffix}
      </div>

      <label className="field">
        <span>{t.cardPayment.cardholderName}</span>
        <input value={value.cardHolder} onChange={(e) => onChange({ cardHolder: e.target.value })} required />
      </label>
      <label className="field">
        <span>{t.cardPayment.cardNumber}</span>
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
          <span>{t.cardPayment.expiry}</span>
          <input
            value={value.cardExpiry}
            onChange={(e) => onChange({ cardExpiry: formatExpiry(e.target.value) })}
            placeholder="12/28"
            inputMode="numeric"
            required
          />
        </label>
        <label className="field">
          <span>{t.cardPayment.cvv}</span>
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
