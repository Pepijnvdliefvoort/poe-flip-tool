interface CurrencyIconProps {
    currency: string
    size?: number
    showLabel?: boolean
}

export function CurrencyIcon({ currency, size = 24, showLabel = false }: CurrencyIconProps) {
    const imagePath = `/currency/${currency.toLowerCase()}.webp`
    
    // Fallback if image doesn't exist
    const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.style.display = 'none'
        const fallback = e.currentTarget.nextElementSibling as HTMLElement
        if (fallback) fallback.style.display = 'inline'
    }

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <img
                src={imagePath}
                alt={currency}
                width={size}
                height={size}
                onError={handleError}
                style={{ 
                    objectFit: 'contain',
                    imageRendering: 'crisp-edges'
                }}
            />
            <span style={{ display: 'none', fontSize: 13, fontWeight: 500 }}>
                {currency}
            </span>
            {showLabel && (
                <span style={{ fontSize: 13, color: 'var(--text)' }}>
                    {currency}
                </span>
            )}
        </span>
    )
}
