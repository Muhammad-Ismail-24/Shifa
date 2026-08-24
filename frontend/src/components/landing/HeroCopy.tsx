/**
 * Bottom-left editorial block. Keeps the reference's deliberate line breaks —
 * the two-line headline is part of the composition, not incidental wrapping.
 */
export function HeroCopy() {
  return (
    <>
      <h1 className="lede__title">
        Speak to Shifa
        <br />
        Know what to do next
      </h1>
      <p className="lede__body">
        Tell Shifa what happened in your own words. It listens, understands your
        situation, and helps you navigate the next step.
      </p>
    </>
  );
}
