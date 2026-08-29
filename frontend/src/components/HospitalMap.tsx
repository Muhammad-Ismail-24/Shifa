export default function HospitalMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="w-full h-96 rounded-xl overflow-hidden border border-white/20 mb-3 relative bg-white/5">
      <iframe 
        width="100%" 
        height="100%" 
        style={{ border: 0 }} 
        loading="lazy" 
        allowFullScreen 
        src={`https://maps.google.com/maps?q=${lat},${lng}&z=13&output=embed`}
      ></iframe>
    </div>
  );
}
