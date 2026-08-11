import { SIGNATURE_VIEWBOX, type SignatureMethod } from '@/lib/signature';

/**
 * A signature, read back.
 *
 * The same mark on the customer's page, on the contractor's copy, and on paper
 * — one component, so a signature can never render one way in the browser and
 * another at the printer.
 *
 * A drawn signature is a <path>, never dangerouslySetInnerHTML. The `d`
 * attribute is set by React as a plain attribute value, so even the strict
 * allowlist in @/lib/signature is the second line of defence rather than the
 * only one.
 */
export default function SignatureMark({
  path,
  name,
  method,
  className,
}: {
  /** Stored path data, when the signature was drawn. */
  path: string | null;
  /** The name on the acceptance. Shown under a drawn mark; IS the mark when typed. */
  name: string | null;
  method: SignatureMethod | null;
  className?: string;
}) {
  if (method === 'drawn' && path) {
    return (
      <span className={`sigmark${className ? ` ${className}` : ''}`}>
        <svg
          className="sigmark-ink"
          viewBox={`0 0 ${SIGNATURE_VIEWBOX.width} ${SIGNATURE_VIEWBOX.height}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label={name ? `Signature of ${name}` : 'Signature'}
          preserveAspectRatio="xMinYMid meet"
        >
          <path d={path} />
        </svg>
      </span>
    );
  }

  if (!name) return null;

  return (
    <span className={`sigmark is-typed${className ? ` ${className}` : ''}`}>
      <span className="sigmark-typed">{name}</span>
    </span>
  );
}
