// Schede della sezione "Stato profilo" (Premium, Verificato): spostate qui
// da MyProfile.jsx l'11/11 per usarle anche in Verification.jsx.

export function StatusBadgeCard({ icon: Icon, color, title, sub }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--surface)',
        border: `1px solid ${color}55`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 8,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Icon size={22} color={color} />
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{sub}</div>
      </div>
    </div>
  );
}

export function PurchaseCard({ icon: Icon, title, sub, buttonLabel, disabled, onClick }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--surface)',
        border: '1px solid rgba(228,212,200,0.12)',
        borderRadius: 14,
        padding: 12,
        marginBottom: 8,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Icon size={22} color="var(--teak)" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          background: 'var(--cyan)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '8px 14px',
          fontSize: 11,
          fontWeight: 700,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
