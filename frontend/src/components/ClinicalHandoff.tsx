/**
 * ClinicalHandoff — renders a scannable QR code containing the English SOAP
 * note, plus a collapsible preview of the plain-text note.
 *
 * Only shown when soap_note_english is present (i.e. after Phase B completes
 * with a full triage session).
 *
 * Styled to match the unified two-phase dashboard glassmorphic theme.
 */

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { UrduText } from './UrduText';

interface Props {
  soapNote: string;
}

export default function ClinicalHandoff({ soapNote }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs uppercase tracking-[0.14em] text-black/45">
          Clinical Handoff
        </h3>
        <UrduText className="text-sm text-black/55">
          کلینیکل سمری QR
        </UrduText>
      </div>

      {/* QR Code */}
      <div className="flex justify-center mb-4">
        <div className="bg-white p-3 rounded-lg shadow-sm">
          <QRCodeSVG
            value={soapNote}
            size={180}
            level="M"
            includeMargin={false}
          />
        </div>
      </div>

      <p className="text-black/45 text-xs text-center mb-4">
        Scan this QR code with any phone to view the clinical summary
      </p>

      {/* Collapsible preview */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-sm text-black/60 hover:text-black transition flex items-center justify-center gap-1"
      >
        {expanded ? '▲ Hide' : '▼ Preview'} SOAP Note
      </button>

      {expanded && (
        <pre className="mt-3 bg-black/5 rounded-lg p-4 text-black/70 text-xs leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto">
          {soapNote}
        </pre>
      )}
    </div>
  );
}
