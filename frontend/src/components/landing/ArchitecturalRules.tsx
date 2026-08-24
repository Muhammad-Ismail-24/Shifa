/** The two full-height rules with `+` intersection markers. Desktop only. */
export function ArchitecturalRules() {
  return (
    <>
      <div className="rule rule--left" aria-hidden="true">
        <span className="rule__seg rule__seg--end" />
        <span className="rule__plus">+</span>
        <span className="rule__seg rule__seg--mid" />
        <span className="rule__plus">+</span>
        <span className="rule__seg rule__seg--end" />
      </div>
      <div className="rule rule--right" aria-hidden="true">
        <span className="rule__seg rule__seg--end" />
        <span className="rule__plus">+</span>
        <span className="rule__seg rule__seg--mid" />
        <span className="rule__plus">+</span>
        <span className="rule__seg rule__seg--end" />
      </div>
    </>
  );
}
