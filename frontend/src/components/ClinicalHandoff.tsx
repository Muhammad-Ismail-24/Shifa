/**
 * ClinicalHandoff — renders a scannable QR code containing the English SOAP
 * note, plus a collapsible preview of the plain-text note.
 *
 * Only shown when soap_note_english is present (i.e. after a full triage).
 */

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  soapNote: string;
}

export default function ClinicalHandoff({ soapNote }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-5 border border-white/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">
          Doctor Clinical Handoff
        </h2>
        <span className="text-white/50 text-sm" dir="rtl" lang="ur">
          کلینیکل سمری
        </span>
      </div>

      {/* QR Code */}
      <div className="flex justify-center mb-4">
        <div className="bg-white p-3 rounded-lg">
          <QRCodeSVG
            value={soapNote}
            size={180}
            level="M"
            includeMargin={false}
          />
        </div>
      </div>

      <p className="text-white/50 text-xs text-center mb-4">
        Scan this QR code with any phone to view the clinical summary
      </p>

      {/* Collapsible preview */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-sm text-blue-400 hover:text-blue-300 transition flex items-center justify-center gap-1"
      >
        {expanded ? '▲ Hide' : '▼ Preview'} SOAP Note
      </button>

      {expanded && (
        <pre className="mt-3 bg-black/30 rounded-lg p-4 text-white/80 text-xs leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto">
          {soapNote}
        </pre>
      )}
    </div>
  );
}

