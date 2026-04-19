import type { ValidationResult } from '../types';

interface ValidationListProps {
  title: string;
  validations: ValidationResult[];
}

export function ValidationList({
  title,
  validations,
}: ValidationListProps) {
  return (
    <section className="panel validation-panel">
      <div className="panel-heading">
        <p className="eyebrow">Validation</p>
        <h3>{title}</h3>
      </div>
      <ul className="validation-list">
        {validations.map((validation) => (
          <li
            key={validation.code}
            className={`validation-item validation-${validation.status}`}
          >
            <span className="validation-pill">{validation.status}</span>
            <span>{validation.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
